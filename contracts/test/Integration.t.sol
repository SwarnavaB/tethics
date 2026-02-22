// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";
import {ShieldFactory} from "../src/ShieldFactory.sol";
import {Shield} from "../src/Shield.sol";
import {IRegistry} from "../src/interfaces/IRegistry.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";

/// @title IntegrationTest
/// @notice End-to-end tests: register → deploy shield → report unauthorized token → drain to charity
contract IntegrationTest is Test {
    Registry public registry;
    ShieldFactory public factory;

    MockSwapRouter public swapRouter;
    MockWETH public weth;
    MockERC20 public badToken;

    address public charity = makeAddr("charity");
    address public reporter = makeAddr("reporter");
    address public buyer1 = makeAddr("buyer1");
    address public buyer2 = makeAddr("buyer2");

    uint256 public founderKey = 0xDEADBEEF;
    address public founder;

    // ─── Setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        founder = vm.addr(founderKey);
        swapRouter = new MockSwapRouter();
        weth = new MockWETH();
        badToken = new MockERC20("ScamToken", "SCAM");

        // Bootstrap: Registry needs factory address; ShieldFactory needs registry address.
        // Use nonce pre-computation: we know this test contract deploys registry at nonce N
        // and factory at nonce N+1.
        uint256 currentNonce = vm.getNonce(address(this));
        address predictedRegistry = vm.computeCreateAddress(address(this), currentNonce);
        address predictedFactory  = vm.computeCreateAddress(address(this), currentNonce + 1);

        registry = new Registry(predictedFactory);
        require(address(registry) == predictedRegistry, "Registry address prediction failed");

        factory = new ShieldFactory(address(registry), address(swapRouter), address(weth));
        require(address(factory) == predictedFactory, "Factory address prediction failed");
    }

    // ─── Full Flow Test ────────────────────────────────────────────────────────

    /// @notice Full happy path: register → deploy shield → report → drain → notify
    function test_fullFlow() public {
        // ── Step 1: Founder registers project ──
        VerificationLib.Proof[] memory proofs = _buildProofs("sovra");
        vm.prank(founder);
        registry.register("sovra", proofs);

        assertTrue(registry.isRegistered("sovra"));
        assertEq(registry.getFounder("sovra"), founder);

        // ── Step 2: Founder deploys Shield ──
        vm.prank(founder);
        address shieldAddr = factory.deployShield("sovra", charity);
        assertTrue(shieldAddr != address(0));

        Shield shield = Shield(payable(shieldAddr));
        assertEq(shield.charityAddress(), charity);
        assertEq(shield.projectName(), "sovra");

        IRegistry.ProjectView memory info = registry.getProjectInfo("sovra");
        assertEq(info.shieldContract, shieldAddr);

        // ── Step 3: Reporter flags unauthorized token ──
        vm.prank(reporter);
        registry.reportUnauthorizedToken("sovra", address(badToken));

        assertEq(registry.reporterScore(reporter), 1);
        assertFalse(registry.isAuthorized("sovra", address(badToken)));

        // ── Step 4: Drain bad token to charity ──
        badToken.mint(shieldAddr, 10_000e18);
        shield.drainToken(address(badToken));
        // MockSwapRouter accepts tokens and returns nothing (swap "works")
        assertEq(badToken.balanceOf(shieldAddr), 0);

        // ── Step 5: Notify buyers ──
        address[] memory holders = new address[](2);
        holders[0] = buyer1;
        holders[1] = buyer2;

        shield.notifyBuyers(address(badToken), holders);

        assertEq(shield.notificationCount(buyer1, address(badToken)), 1);
        assertEq(shield.notificationCount(buyer2, address(badToken)), 1);

        // ── Step 6: Founder authorizes legitimate token ──
        address legitimateToken = makeAddr("legit");
        vm.prank(founder);
        registry.authorizeToken("sovra", legitimateToken);

        assertTrue(registry.isAuthorized("sovra", legitimateToken));
        assertFalse(registry.isAuthorized("sovra", address(badToken)));

        // Can't report authorized token
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.TokenIsAuthorized.selector, legitimateToken));
        registry.reportUnauthorizedToken("sovra", legitimateToken);

        // ── Step 7: Founder revokes authorization ──
        vm.prank(founder);
        registry.revokeToken("sovra", legitimateToken);
        assertFalse(registry.isAuthorized("sovra", legitimateToken));

        // ── Step 8: ETH sent to shield goes to charity ──
        uint256 beforeCharity = charity.balance;
        deal(reporter, 5 ether);
        vm.prank(reporter);
        (bool ok,) = shieldAddr.call{value: 5 ether}("");
        assertTrue(ok);
        assertEq(charity.balance, beforeCharity + 5 ether);
    }

    function test_nameNormalizationConsistency() public {
        VerificationLib.Proof[] memory proofs = _buildProofs("myproject");
        vm.prank(founder);
        registry.register("  MyProject  ", proofs);

        // All variants resolve to same project
        assertTrue(registry.isRegistered("myproject"));
        assertTrue(registry.isRegistered("MYPROJECT"));
        assertTrue(registry.isRegistered("MyProject"));
        assertEq(registry.getFounder("myproject"), registry.getFounder("MyProject"));
    }

    function test_challengeWindowFlow() public {
        VerificationLib.Proof[] memory proofs = _buildProofs("contested");
        vm.prank(founder);
        registry.register("contested", proofs);

        assertTrue(block.timestamp <= registry.getProjectInfo("contested").challengeDeadline);

        // After window, dispute should revert
        vm.warp(block.timestamp + registry.CHALLENGE_WINDOW() + 1);
        vm.prank(makeAddr("challenger"));
        vm.expectRevert(IRegistry.ChallengeWindowClosed.selector);
        registry.disputeRegistration("contested", "I am the real founder", proofs);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _buildProofs(string memory name)
        internal
        returns (VerificationLib.Proof[] memory proofs)
    {
        proofs = new VerificationLib.Proof[](2);

        // Proof 1: Deployer sig - compute hash inline (not via library call) to ensure correctness
        bytes32 inner = keccak256(
            abi.encodePacked("tethics:register:", name, ":", founder)
        );
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", inner)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(founderKey, ethHash);
        proofs[0] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_DEPLOYER_SIG,
            data: abi.encode(founder, abi.encodePacked(r, s, v))
        });

        // Proof 2: ENS
        proofs[1] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_ENS,
            data: abi.encode(string(abi.encodePacked(name, ".eth")))
        });
    }
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

contract MockSwapRouter {
    // Accept tokens (approve is called by Shield), succeed silently
    function exactInputSingle(
        ISwapRouterParams calldata params
    ) external returns (uint256 amountOut) {
        // Drain tokens from caller to simulate swap
        IERC20Min(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = 0; // return 0 ETH - charity gets nothing from swap in test
    }
}

struct ISwapRouterParams {
    address tokenIn;
    address tokenOut;
    uint24 fee;
    address recipient;
    uint256 deadline;
    uint256 amountIn;
    uint256 amountOutMinimum;
    uint160 sqrtPriceLimitX96;
}

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract MockWETH {
    mapping(address => uint256) public balanceOf;

    receive() external payable {}
}

contract MockERC20 {
    string public name;
    string public symbol;
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
