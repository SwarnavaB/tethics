// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Shield} from "../src/Shield.sol";
import {IShield} from "../src/interfaces/IShield.sol";

/// @title ShieldTest
/// @notice Unit tests for Shield.sol
contract ShieldTest is Test {
    Shield public shield;

    address public registry = makeAddr("registry");
    address public founder = makeAddr("founder");
    address public charity = makeAddr("charity");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    RevertingSwapRouter public swapRouter;
    MockWETH public weth;
    MockERC20 public token;

    event ShieldActive(string indexed projectName, address indexed shieldAddress, address indexed charityAddress);
    event FundsRoutedToCharity(address indexed tokenContract, uint256 amount, address indexed charityAddress);
    event FundsHeldPendingRetry(address indexed tokenContract, uint256 amount, string reason);
    event BuyersNotified(address indexed unauthorizedToken, uint256 holderCount, address indexed caller);
    event UnauthorizedTokenDetected(string indexed projectName, address indexed tokenContract, address indexed reporter);

    function setUp() public {
        swapRouter = new RevertingSwapRouter();
        weth = new MockWETH();
        shield = new Shield("myproject", charity, registry, founder, address(swapRouter), address(weth));
        token = new MockERC20("BadToken", "BAD");
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(shield.charityAddress(), charity);
        assertEq(shield.registry(), registry);
        assertEq(shield.founder(), founder);
        assertEq(shield.projectName(), "myproject");
    }

    function test_constructor_zeroCharityReverts() public {
        vm.expectRevert(IShield.ZeroCharityAddress.selector);
        new Shield("myproject", address(0), registry, founder, address(swapRouter), address(weth));
    }

    // ─── ETH Routing ──────────────────────────────────────────────────────────

    function test_receive_routesETHToCharity() public {
        uint256 before = charity.balance;
        deal(alice, 1 ether);

        vm.prank(alice);
        (bool ok,) = address(shield).call{value: 1 ether}("");
        assertTrue(ok);

        assertEq(charity.balance - before, 1 ether);
    }

    function test_drainETH_success() public {
        deal(address(shield), 2 ether);
        uint256 before = charity.balance;

        shield.drainETH();

        assertEq(charity.balance - before, 2 ether);
        assertEq(address(shield).balance, 0);
    }

    function test_drainETH_noFunds_reverts() public {
        vm.expectRevert(IShield.NoFundsToRoute.selector);
        shield.drainETH();
    }

    // ─── Token Drain ──────────────────────────────────────────────────────────

    function test_drainToken_noFunds_reverts() public {
        vm.expectRevert(IShield.NoFundsToRoute.selector);
        shield.drainToken(address(token));
    }

    function test_drainToken_swapFails_holdsAndEmitsEvent() public {
        // swapRouter is set to REVERT mode
        swapRouter.setShouldRevert(true);
        token.mint(address(shield), 1000e18);

        vm.expectEmit(true, false, false, false);
        emit FundsHeldPendingRetry(address(token), 1000e18, "");
        shield.drainToken(address(token));

        // Tokens still held - approval revoked
        assertEq(token.balanceOf(address(shield)), 1000e18);
    }

    function test_drainToken_swapSucceeds_emitsFundsRouted() public {
        // swapRouter succeeds (returns 32 bytes = success)
        swapRouter.setShouldRevert(false);
        token.mint(address(shield), 1000e18);

        // Expect FundsRoutedToCharity to be emitted (swap succeeded path)
        vm.expectEmit(true, false, false, false);
        emit FundsRoutedToCharity(address(token), 1000e18, charity);
        shield.drainToken(address(token));
    }

    // ─── Buyer Notification ───────────────────────────────────────────────────

    function test_notifyBuyers_rateLimits() public {
        address[] memory holders = new address[](2);
        holders[0] = alice;
        holders[1] = bob;

        address unauthorizedToken = makeAddr("badToken");

        shield.notifyBuyers(unauthorizedToken, holders);

        // First call: both notified
        assertEq(shield.notificationCount(alice, unauthorizedToken), 1);
        assertEq(shield.notificationCount(bob, unauthorizedToken), 1);

        // Second call within window: no new notifications
        shield.notifyBuyers(unauthorizedToken, holders);
        assertEq(shield.notificationCount(alice, unauthorizedToken), 1);

        // After window passes: notifications allowed again
        vm.warp(block.timestamp + shield.NOTIFICATION_WINDOW() + 1);
        shield.notifyBuyers(unauthorizedToken, holders);
        assertEq(shield.notificationCount(alice, unauthorizedToken), 2);
    }

    function test_notifyBuyers_skipsZeroAddress() public {
        address[] memory holders = new address[](2);
        holders[0] = address(0);
        holders[1] = alice;

        address unauthorizedToken = makeAddr("badToken");
        shield.notifyBuyers(unauthorizedToken, holders);

        // zero address skipped
        assertEq(shield.notificationCount(address(0), unauthorizedToken), 0);
        // alice notified
        assertEq(shield.notificationCount(alice, unauthorizedToken), 1);
    }

    // ─── Registry Callback ────────────────────────────────────────────────────

    function test_onUnauthorizedTokenReported_onlyRegistry() public {
        address token_ = makeAddr("token");
        vm.prank(alice);
        vm.expectRevert(IShield.NotRegistry.selector);
        shield.onUnauthorizedTokenReported(token_, alice);
    }

    function test_onUnauthorizedTokenReported_success() public {
        address token_ = makeAddr("token");
        vm.prank(registry);
        vm.expectEmit(false, true, true, false);
        emit UnauthorizedTokenDetected("myproject", token_, alice);
        shield.onUnauthorizedTokenReported(token_, alice);
    }
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

/// @notice Swap router that can be toggled between success and revert.
/// Uses a fallback to match any call signature (including the struct variant Shield sends).
contract RevertingSwapRouter {
    bool public shouldRevert;

    function setShouldRevert(bool _revert) external {
        shouldRevert = _revert;
    }

    fallback() external {
        if (shouldRevert) revert("swap failed: no liquidity");
        // Return ABI-encoded uint256(1) to signal 1 token out
        bytes memory ret = abi.encode(uint256(1));
        assembly {
            return(add(ret, 32), 32)
        }
    }
}

contract MockWETH {
    mapping(address => uint256) public balanceOf;
    receive() external payable {}
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
