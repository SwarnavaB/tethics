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

    /// @notice Public view of a pending (awaiting approval) registration
    struct PendingProjectView {
        address founder;
        bytes32[] proofHashes;
        uint256 submittedAt;
        bool exists;
    }

    /// @notice Public view of a cross-chain founder claim anchored for review
    struct ExternalClaimView {
        uint256 claimId;
        bytes32 nameHash;
        string name;
        string ecosystem;
        address proposer;
        bytes32 payloadHash;
        string metadataURI;
        uint256 submittedAt;
        bool exists;
        bool reviewed;
        bool approved;
        address reviewer;
        uint256 reviewedAt;
        bytes32 resolutionHash;
        string resolutionURI;
        string reviewNotes;
    }

    /// @notice Public view of a non-EVM asset authorization record
    struct ExternalAssetView {
        bytes32 nameHash;
        string name;
        string ecosystem;
        string assetType;
        string assetId;
        string metadataURI;
        bool authorized;
        address updatedBy;
        uint256 updatedAt;
        bool exists;
    }

    /// @notice Public view of an approved charity option for Shield deployment
    struct CharityOptionView {
        uint256 charityId;
        string name;
        address payoutAddress;
        string metadataURI;
        bool active;
        uint256 createdAt;
        uint256 updatedAt;
        bool exists;
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when contract ownership is transferred
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice Emitted when an approver is added
    event ApproverAdded(address indexed approver);

    /// @notice Emitted when an approver is removed
    event ApproverRemoved(address indexed approver);

    /// @notice Emitted when a charity manager is added
    event CharityManagerAdded(address indexed manager);

    /// @notice Emitted when a charity manager is removed
    event CharityManagerRemoved(address indexed manager);

    /// @notice Emitted when a founder submits a registration (awaiting approval)
    event RegistrationSubmitted(
        bytes32 indexed nameHash,
        string name,
        address indexed founder,
        uint256 submittedAt
    );

    /// @notice Emitted when an approver approves a pending registration
    event RegistrationApproved(bytes32 indexed nameHash, string name, address indexed approver);

    /// @notice Emitted when an approver rejects a pending registration
    event RegistrationRejected(
        bytes32 indexed nameHash,
        string name,
        address indexed approver,
        string reason
    );

    /// @notice Emitted when a new project becomes active (after approval)
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

    /// @notice Emitted when a founder anchors a non-EVM or cross-chain project claim for review
    event ExternalClaimSubmitted(
        uint256 indexed claimId,
        bytes32 indexed nameHash,
        string name,
        string ecosystem,
        address indexed proposer,
        bytes32 payloadHash,
        string metadataURI
    );

    /// @notice Emitted when a curator or approver reviews an anchored external claim
    event ExternalClaimReviewed(
        uint256 indexed claimId,
        bytes32 indexed nameHash,
        string name,
        string ecosystem,
        address indexed reviewer,
        bool approved,
        bytes32 resolutionHash,
        string resolutionURI,
        string reviewNotes
    );

    /// @notice Emitted when a non-EVM asset is authorized for a project
    event ExternalAssetAuthorized(
        bytes32 indexed nameHash,
        bytes32 indexed assetKey,
        string name,
        string ecosystem,
        string assetType,
        string assetId,
        address indexed actor,
        string metadataURI
    );

    /// @notice Emitted when a non-EVM asset authorization is revoked
    event ExternalAssetRevoked(
        bytes32 indexed nameHash,
        bytes32 indexed assetKey,
        string name,
        string ecosystem,
        string assetType,
        string assetId,
        address indexed actor,
        string metadataURI
    );

    /// @notice Emitted when a charity option is added or updated
    event CharityOptionConfigured(
        uint256 indexed charityId,
        string name,
        address indexed payoutAddress,
        string metadataURI,
        bool active,
        address indexed actor
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotApprover();
    error ZeroOwner();
    error InvalidApproverAddress();
    error InvalidCharityManagerAddress();
    error RegistrationPending(bytes32 nameHash);
    error NoPendingRegistration(bytes32 nameHash);
    error ProjectAlreadyExists(bytes32 nameHash);
    error ProjectNotFound(bytes32 nameHash);
    error NotFounder(address caller, address founder);
    error TokenAlreadyAuthorized(address tokenContract);
    error TokenNotAuthorized(address tokenContract);
    error TokenIsAuthorized(address tokenContract);
    error InvalidTokenContract();
    error InvalidAdditionalAddress();
    error InvalidShieldContract();
    error InvalidProjectName();
    error InvalidCharityAddress();
    error InvalidCharityName();
    error ChallengeWindowOpen();
    error ChallengeWindowClosed();
    error ShieldAlreadyLinked();
    error OnlyShieldFactory();
    error DuplicateUnauthorizedReport(address reporter, address tokenContract);
    error InvalidEcosystem();
    error EmptyPayloadHash();
    error MissingMetadataURI();
    error MissingResolutionHash();
    error MissingResolutionURI();
    error NoExternalClaim(uint256 claimId);
    error ExternalClaimAlreadyReviewed(uint256 claimId);
    error NoExternalAsset(bytes32 assetKey);
    error InvalidAssetType();
    error InvalidAssetId();
    error NotExternalAssetManager(address caller);
    error NoCharityOption(uint256 charityId);
    error InactiveCharityOption(uint256 charityId);

    // ─── Governance Functions ─────────────────────────────────────────────────

    /// @notice Transfer contract ownership to a new address
    /// @param newOwner Address of the new owner
    function transferOwnership(address newOwner) external;

    /// @notice Add an address to the approver set (owner only)
    /// @param approver Address to grant approver rights
    function addApprover(address approver) external;

    /// @notice Remove an address from the approver set (owner only)
    /// @param approver Address to revoke approver rights from
    function removeApprover(address approver) external;

    /// @notice Add an address to the charity manager set (owner only)
    /// @param manager Address to grant charity catalog management rights
    function addCharityManager(address manager) external;

    /// @notice Remove an address from the charity manager set (owner only)
    /// @param manager Address to revoke charity catalog management rights from
    function removeCharityManager(address manager) external;

    /// @notice Add a new approved charity option for future Shield deployments
    function addCharityOption(
        string calldata name,
        address payoutAddress,
        string calldata metadataURI
    ) external returns (uint256 charityId);

    /// @notice Update an existing charity option and its active status
    function updateCharityOption(
        uint256 charityId,
        string calldata name,
        address payoutAddress,
        string calldata metadataURI,
        bool active
    ) external;

    // ─── Approval Functions ───────────────────────────────────────────────────

    /// @notice Approve a pending registration, making the project active
    /// @param name Project name matching the pending submission
    function approveRegistration(string calldata name) external;

    /// @notice Reject a pending registration; founder may re-apply
    /// @param name Project name matching the pending submission
    /// @param reason Human-readable reason for rejection
    function rejectRegistration(string calldata name, string calldata reason) external;

    // ─── Core Functions ────────────────────────────────────────────────────────

    /// @notice Submit a registration for approval. Onchain proofs (DEPLOYER_SIG) are verified
    ///         immediately; off-chain proofs are stored as hashes for approver review.
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

    /// @notice Anchor a cross-chain founder claim for public review
    /// @param name Project name
    /// @param ecosystem External ecosystem label such as SOLANA
    /// @param payloadHash Hash of the offchain proposal package
    /// @param metadataURI Public URI for the proposal package or evidence bundle
    /// @return claimId Sequential claim id
    function submitExternalClaim(
        string calldata name,
        string calldata ecosystem,
        bytes32 payloadHash,
        string calldata metadataURI
    ) external returns (uint256 claimId);

    /// @notice Review an anchored external claim
    /// @param claimId Claim id to review
    /// @param approved Whether the claim is approved
    /// @param reviewNotes Human-readable review notes
    /// @param resolutionHash Hash of the final review artifact or signed bundle
    /// @param resolutionURI Public URI for the final review artifact or signed bundle
    function reviewExternalClaim(
        uint256 claimId,
        bool approved,
        string calldata reviewNotes,
        bytes32 resolutionHash,
        string calldata resolutionURI
    ) external;

    /// @notice Authorize a non-EVM asset such as a Solana mint or Bags creator identifier
    function authorizeExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId,
        string calldata metadataURI
    ) external;

    /// @notice Revoke a non-EVM asset authorization
    function revokeExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId,
        string calldata metadataURI
    ) external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Check if a token is authorized by a project's founder
    /// @param name Project name
    /// @param tokenContract Token contract address
    /// @return True if authorized
    function isAuthorized(string calldata name, address tokenContract) external view returns (bool);

    /// @notice Get full public info for a registered project
    /// @param name Project name
    /// @return ProjectView struct with all public data
    function getProjectInfo(string calldata name) external view returns (ProjectView memory);

    /// @notice Get public info for a pending (awaiting approval) registration
    /// @param name Project name
    /// @return PendingProjectView struct
    function getPendingInfo(string calldata name) external view returns (PendingProjectView memory);

    /// @notice Get the founder address for a project
    /// @param name Project name
    /// @return Founder address
    function getFounder(string calldata name) external view returns (address);

    /// @notice Check if a project name is registered (active)
    /// @param name Project name
    /// @return True if registered and approved
    function isRegistered(string calldata name) external view returns (bool);

    /// @notice Check if a project name has a pending registration awaiting approval
    /// @param name Project name
    /// @return True if pending
    function isPending(string calldata name) external view returns (bool);

    /// @notice Get the full public record for an anchored external claim
    /// @param claimId Claim id
    /// @return ExternalClaimView struct
    function getExternalClaim(uint256 claimId) external view returns (ExternalClaimView memory);

    /// @notice Get a non-EVM asset authorization record
    function getExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId
    ) external view returns (ExternalAssetView memory);

    /// @notice Get an approved charity option by id
    function getCharityOption(uint256 charityId) external view returns (CharityOptionView memory);
}
