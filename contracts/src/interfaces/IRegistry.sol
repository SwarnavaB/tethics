// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VerificationLib} from "../libraries/VerificationLib.sol";

/// @title IRegistry
/// @notice Interface for the tethics Registry contract
interface IRegistry {
    // ─── Structs ─────────────────────────────────────────────────────────────

    /// @notice Public view of a registered project
    struct ProjectView {
        address founder;
        address[] additionalAddresses;
        address shieldContract;
        bytes32[] verificationProofs;
        uint256 registeredAt;
        uint256 challengeDeadline; // Unix timestamp until which disputes are accepted
        bool exists;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a new project is registered
    event ProjectRegistered(
        bytes32 indexed nameHash,
        string name,
        address indexed founder,
        uint256 challengeDeadline
    );

    /// @notice Emitted when a Shield contract is linked to a project
    event ShieldLinked(bytes32 indexed nameHash, address indexed shieldContract);

    /// @notice Emitted when a founder authorizes a token contract
    event TokenAuthorized(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);

    /// @notice Emitted when a founder revokes a token authorization
    event TokenRevoked(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);

    /// @notice Emitted when an unauthorized token is reported
    event UnauthorizedTokenReported(
        bytes32 indexed nameHash,
        string name,
        address indexed tokenContract,
        address indexed reporter
    );

    /// @notice Emitted when an additional address is added to a project
    event AddressAdded(bytes32 indexed nameHash, address indexed addedAddress);

    /// @notice Emitted when a registration dispute is raised
    event DisputeRaised(bytes32 indexed nameHash, address indexed challenger, string reason);

    /// @notice Emitted when a registration dispute is resolved
    event DisputeResolved(bytes32 indexed nameHash, address indexed newFounder);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error ProjectAlreadyExists(bytes32 nameHash);
    error ProjectNotFound(bytes32 nameHash);
    error NotFounder(address caller, address founder);
    error TokenAlreadyAuthorized(address tokenContract);
    error TokenNotAuthorized(address tokenContract);
    error TokenIsAuthorized(address tokenContract);
    error InvalidProjectName();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error ShieldAlreadyLinked();
    error OnlyShieldFactory();

    // ─── Core Functions ────────────────────────────────────────────────────────

    /// @notice Register a new project with cryptographic identity proofs
    /// @param name Project name (will be normalized onchain)
    /// @param proofs Array of at least 2 verification proofs from different categories
    function register(string calldata name, VerificationLib.Proof[] calldata proofs) external;

    /// @notice Link a deployed Shield contract to this project (called by ShieldFactory)
    /// @param name Project name
    /// @param shieldContract Address of the deployed Shield
    function linkShield(string calldata name, address shieldContract) external;

    /// @notice Authorize a token contract as legitimate for this project
    /// @param name Project name
    /// @param tokenContract Address of the token contract to authorize
    function authorizeToken(string calldata name, address tokenContract) external;

    /// @notice Revoke authorization for a token contract
    /// @param name Project name
    /// @param tokenContract Address of the token contract to revoke
    function revokeToken(string calldata name, address tokenContract) external;

    /// @notice Add an additional verified address to the project
    /// @param name Project name
    /// @param additionalAddress Address to add
    function addAddress(string calldata name, address additionalAddress) external;

    /// @notice Permissionlessly report an unauthorized token
    /// @param name Project name
    /// @param tokenContract Token contract address
    function reportUnauthorizedToken(string calldata name, address tokenContract) external;

    /// @notice Raise a dispute against a newly registered project during the challenge window
    /// @param name Project name
    /// @param reason Human-readable dispute reason
    /// @param proofs Stronger proofs to back the challenge
    function disputeRegistration(
        string calldata name,
        string calldata reason,
        VerificationLib.Proof[] calldata proofs
    ) external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Check if a token is authorized by a project's founder
    /// @param name Project name
    /// @param tokenContract Token contract address
    /// @return True if authorized
    function isAuthorized(string calldata name, address tokenContract) external view returns (bool);

    /// @notice Get full public info for a project
    /// @param name Project name
    /// @return ProjectView struct with all public data
    function getProjectInfo(string calldata name) external view returns (ProjectView memory);

    /// @notice Get the founder address for a project
    /// @param name Project name
    /// @return Founder address
    function getFounder(string calldata name) external view returns (address);

    /// @notice Check if a project name is registered
    /// @param name Project name
    /// @return True if registered
    function isRegistered(string calldata name) external view returns (bool);
}
