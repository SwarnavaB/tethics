// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IShield
/// @notice Interface for the per-founder Shield contract
interface IShield {
    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when the Shield is deployed and active
    event ShieldActive(string indexed projectName, address indexed shieldAddress, address indexed charityAddress);

    /// @notice Emitted when an unauthorized token detection is forwarded here
    event UnauthorizedTokenDetected(
        string indexed projectName,
        address indexed tokenContract,
        address indexed reporter
    );

    /// @notice Emitted when tokens/ETH are successfully routed to charity
    event FundsRoutedToCharity(
        address indexed tokenContract,
        uint256 amount,
        address indexed charityAddress
    );

    /// @notice Emitted when a swap fails and funds are held pending retry
    event FundsHeldPendingRetry(address indexed tokenContract, uint256 amount, string reason);

    /// @notice Emitted when buyers are notified of an unauthorized token
    event BuyersNotified(address indexed unauthorizedToken, uint256 holderCount, address indexed caller);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ZeroCharityAddress();
    error NotRegistry();
    error RateLimitExceeded(address holder, address tokenContract);
    error NoFundsToRoute();
    error SwapFailed(address tokenContract);

    // ─── Core Functions ────────────────────────────────────────────────────────

    /// @notice Drain any ERC20 token held in this contract to charity via DEX swap
    /// @param tokenContract Address of the ERC20 token to drain
    function drainToken(address tokenContract) external;

    /// @notice Drain native ETH held in this contract to charity
    function drainETH() external;

    /// @notice Send zero-value transfer notifications to holders of an unauthorized token
    /// @param unauthorizedToken The unauthorized token contract address
    /// @param holders Array of holder addresses to notify (off-chain determined)
    function notifyBuyers(address unauthorizedToken, address[] calldata holders) external;

    /// @notice Called by Registry when an unauthorized token is reported
    /// @param tokenContract The unauthorized token address
    /// @param reporter Address that reported it
    function onUnauthorizedTokenReported(address tokenContract, address reporter) external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Get the charity address this Shield routes funds to
    function charityAddress() external view returns (address);

    /// @notice Get the registry address
    function registry() external view returns (address);

    /// @notice Get the project name this Shield protects
    function projectName() external view returns (string memory);

    /// @notice Get the founder address
    function founder() external view returns (address);

    /// @notice Check how many times a holder has been notified for a given token (for rate limiting)
    function notificationCount(address holder, address tokenContract) external view returns (uint256);
}
