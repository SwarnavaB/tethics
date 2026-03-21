// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShield} from "./interfaces/IShield.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/// @title Shield
/// @notice Per-founder contract that: receives unauthorized token proceeds, swaps to ETH/USDC,
///         forwards 100% to charity, notifies token holders, and emits rich attestation events.
/// @dev    Deployed via ShieldFactory (CREATE2). Charity address is immutable. Founder never
///         has custody of swapped funds - single-transaction path: receive → swap → charity.
contract Shield is IShield {
    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Rate limit: 1 notification per holder per token per window (24h)
    uint256 public constant NOTIFICATION_WINDOW = 24 hours;

    /// @notice Slippage tolerance for DEX swaps (5% = 9500/10000)
    uint256 public constant SWAP_SLIPPAGE_BPS = 500; // 5%

    /// @notice Uniswap V3 pool fee tier to use for swaps (0.3%)
    uint24 public constant POOL_FEE = 3000;

    // ─── Immutables ───────────────────────────────────────────────────────────

    /// @inheritdoc IShield
    address public immutable override charityAddress;

    /// @inheritdoc IShield
    address public immutable override registry;

    /// @inheritdoc IShield
    address public immutable override founder;

    /// @notice DEX swap router address (Uniswap V3 or Aerodrome)
    address public immutable swapRouter;

    /// @notice WETH or USDC address - the intermediate/output token for swaps
    address public immutable weth;

    string private _projectName;

    // ─── Storage ─────────────────────────────────────────────────────────────

    /// @dev holder → tokenContract → last notification timestamp
    mapping(address => mapping(address => uint256)) private _lastNotified;

    /// @dev holder → tokenContract → total notification count
    mapping(address => mapping(address => uint256)) private _notificationCount;

    /// @dev True while unwrapping WETH into native ETH for a drain flow
    bool private _acceptingWrappedNative;

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _projectName_ Normalized project name this Shield protects
    /// @param _charity Immutable charity address (The Giving Block, GiveDirectly, etc.)
    /// @param _registry Address of the Registry contract
    /// @param _founder Founder's address
    /// @param _swapRouter DEX router for token → ETH swaps
    /// @param _weth WETH (or USDC) address for swap output
    constructor(
        string memory _projectName_,
        address _charity,
        address _registry,
        address _founder,
        address _swapRouter,
        address _weth
    ) {
        if (_charity == address(0)) revert ZeroCharityAddress();
        _projectName = _projectName_;
        charityAddress = _charity;
        registry = _registry;
        founder = _founder;
        swapRouter = _swapRouter;
        weth = _weth;

        emit ShieldActive(_projectName_, address(this), _charity);
    }

    // ─── Receive ETH ─────────────────────────────────────────────────────────

    /// @notice Accept ETH - immediately forward to charity (no accumulation)
    receive() external payable {
        if (msg.value > 0) {
            if (_acceptingWrappedNative) {
                return;
            }
            if (_sendETHToCharity(msg.value)) {
                emit FundsRoutedToCharity(address(0), msg.value, charityAddress);
            } else {
                emit FundsHeldPendingRetry(address(0), msg.value, "charity transfer failed");
            }
        }
    }

    // ─── Drain Functions ─────────────────────────────────────────────────────

    /// @inheritdoc IShield
    /// @notice Anyone can trigger a drain - permissionless charity routing
    function drainToken(address tokenContract, uint256 minAmountOut) external override {
        if (minAmountOut == 0) revert InvalidMinimumAmountOut();
        uint256 balance = IERC20(tokenContract).balanceOf(address(this));
        if (balance == 0) revert NoFundsToRoute();

        (bool swapped, uint256 ethAmount) = _swapTokenToETH(tokenContract, balance, minAmountOut);

        if (swapped) {
            if (_sendETHToCharity(ethAmount)) {
                emit FundsRoutedToCharity(tokenContract, ethAmount, charityAddress);
            } else {
                emit FundsHeldPendingRetry(
                    tokenContract,
                    ethAmount,
                    "charity transfer failed"
                );
            }
        } else {
            // Swap failed (no liquidity) - hold until retry
            emit FundsHeldPendingRetry(
                tokenContract,
                balance,
                "DEX swap failed: no liquidity or price impact too high"
            );
        }
    }

    /// @inheritdoc IShield
    function drainETH() external override {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoFundsToRoute();
        if (_sendETHToCharity(balance)) {
            emit FundsRoutedToCharity(address(0), balance, charityAddress);
        } else {
            emit FundsHeldPendingRetry(address(0), balance, "charity transfer failed");
        }
    }

    // ─── Buyer Notification ───────────────────────────────────────────────────

    /// @inheritdoc IShield
    /// @notice Permissionlessly notify buyers of an unauthorized token
    ///         Caller pays gas - community defense mechanism
    function notifyBuyers(address unauthorizedToken, address[] calldata holders)
        external
        override
    {
        uint256 notified = 0;
        string memory message = string(
            abi.encodePacked(
                "WARNING: Token ",
                _toHexString(unauthorizedToken),
                " is NOT authorized by project '",
                _projectName,
                "'. Verify at tethics.eth"
            )
        );

        for (uint256 i = 0; i < holders.length; i++) {
            address holder = holders[i];
            if (holder == address(0)) continue;

            // Rate limit: once per 24h per holder per token.
            // If lastNotified == 0, holder has never been notified - always allow.
            uint256 lastNotified = _lastNotified[holder][unauthorizedToken];
            if (lastNotified != 0 && block.timestamp - lastNotified < NOTIFICATION_WINDOW) {
                continue;
            }

            _lastNotified[holder][unauthorizedToken] = block.timestamp;
            _notificationCount[holder][unauthorizedToken]++;

            // Zero-value transfer with calldata message - wallet shows as activity
            // This is a standard ERC20 transfer(to, 0) with no state change on the token
            // We emit our own event instead to avoid calling arbitrary token contracts
            notified++;
            emit HolderNotified(holder, unauthorizedToken, message);
        }

        emit BuyersNotified(unauthorizedToken, notified, msg.sender);
    }

    // ─── Registry Callback ────────────────────────────────────────────────────

    /// @inheritdoc IShield
    function onUnauthorizedTokenReported(address tokenContract, address reporter)
        external
        override
    {
        if (msg.sender != registry) revert NotRegistry();
        emit UnauthorizedTokenDetected(_projectName, tokenContract, reporter);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @inheritdoc IShield
    function projectName() external view override returns (string memory) {
        return _projectName;
    }

    /// @inheritdoc IShield
    function notificationCount(address holder, address tokenContract)
        external
        view
        override
        returns (uint256)
    {
        return _notificationCount[holder][tokenContract];
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /// @notice Swap ERC20 token to ETH via DEX router
    /// @param tokenContract Token to swap
    /// @param amount Amount to swap
    /// @param minAmountOut Minimum acceptable wrapped-native output
    /// @return success True if swap succeeded
    function _swapTokenToETH(address tokenContract, uint256 amount, uint256 minAmountOut)
        internal
        returns (bool success, uint256 amountOut)
    {
        if (tokenContract == weth) {
            if (amount < minAmountOut) {
                return (false, 0);
            }
            _acceptingWrappedNative = true;
            IWETH(weth).withdraw(amount);
            _acceptingWrappedNative = false;
            return (true, amount);
        }

        // Approve router
        IERC20(tokenContract).approve(swapRouter, amount);

        // Use low-level call to avoid Solidity revert on missing code at router address.
        // This gives us a clean bool return even if the router doesn't exist yet.
        bytes memory callData = abi.encodeCall(
            ISwapRouter.exactInputSingle,
            (ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenContract,
                tokenOut: weth,
                fee: POOL_FEE,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amount,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            }))
        );

        (bool ok, bytes memory returnData) = swapRouter.call(callData);

        if (ok && returnData.length >= 32) {
            amountOut = abi.decode(returnData, (uint256));
            if (amountOut > 0) {
                _acceptingWrappedNative = true;
                IWETH(weth).withdraw(amountOut);
                _acceptingWrappedNative = false;
                return (true, amountOut);
            }
        }

        // Revoke approval on failure to prevent stuck approvals
        IERC20(tokenContract).approve(swapRouter, 0);
        return (false, 0);
    }

    /// @notice Send ETH to charity address
    /// @param amount Amount in wei
    function _sendETHToCharity(uint256 amount) internal returns (bool ok) {
        (bool success,) = charityAddress.call{value: amount}("");
        return success;
    }

    /// @notice Convert address to hex string for notification messages
    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            buffer[2 + i * 2] = _hexChar(b >> 4);
            buffer[3 + i * 2] = _hexChar(b & 0x0f);
        }
        return string(buffer);
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        if (v < 10) return bytes1(v + 48); // '0'-'9'
        return bytes1(v + 87); // 'a'-'f'
    }
}

// ─── Minimal ERC20 Interface ─────────────────────────────────────────────────

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IWETH {
    function withdraw(uint256 amount) external;
}
