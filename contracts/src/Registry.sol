// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRegistry} from "./interfaces/IRegistry.sol";
import {VerificationLib} from "./libraries/VerificationLib.sol";
import {StringUtils} from "./libraries/StringUtils.sol";

/// @title Registry
/// @notice Onchain registry of verified projects and their authorized tokens.
///         Deployed once per chain; acts as a public utility.
/// @dev    Founders submit registrations with multi-signal proofs. The contract owner
///         (initially the tethics.eth holder) and any delegated approvers review off-chain
///         proofs and approve or reject registrations. Anyone can query authorization status.
///         No upgrade keys, no token, no fees.
contract Registry is IRegistry {
    using VerificationLib for VerificationLib.Proof[];
    using StringUtils for string;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Duration of the challenge window after a registration is approved (48 hours)
    uint256 public constant CHALLENGE_WINDOW = 48 hours;

    /// @notice Address of the ShieldFactory - only it may call linkShield
    address public immutable shieldFactory;

    // ─── Governance Storage ───────────────────────────────────────────────────

    /// @notice Owner of this registry; can add/remove approvers and transfer ownership
    address public owner;

    /// @notice Addresses authorised to approve or reject pending registrations
    mapping(address => bool) public isApprover;

    // ─── Project Storage ──────────────────────────────────────────────────────

    struct Project {
        address founder;
        address[] additionalAddresses;
        address shieldContract;
        bytes32[] verificationProofs;
        uint256 registeredAt;
        uint256 challengeDeadline;
        bool exists;
    }

    struct PendingProject {
        address founder;
        bytes32[] proofHashes;
        uint256 submittedAt;
        bool exists;
    }

    /// @dev projectName hash => active Project
    mapping(bytes32 => Project) private _projects;

    /// @dev projectName hash => PendingProject (awaiting approval)
    mapping(bytes32 => PendingProject) private _pendingProjects;

    /// @dev projectName hash => tokenContract => authorized
    mapping(bytes32 => mapping(address => bool)) private _authorizedTokens;

    /// @dev reporter address => number of successful reports
    mapping(address => uint256) public reporterScore;

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _shieldFactory Address of the ShieldFactory contract (immutable after deploy)
    constructor(address _shieldFactory) {
        shieldFactory = _shieldFactory;
        owner = msg.sender;
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function transferOwnership(address newOwner) external override {
        if (msg.sender != owner) revert NotOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @inheritdoc IRegistry
    function addApprover(address approver) external override {
        if (msg.sender != owner) revert NotOwner();
        isApprover[approver] = true;
        emit ApproverAdded(approver);
    }

    /// @inheritdoc IRegistry
    function removeApprover(address approver) external override {
        if (msg.sender != owner) revert NotOwner();
        isApprover[approver] = false;
        emit ApproverRemoved(approver);
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function register(string calldata name, VerificationLib.Proof[] calldata proofs) external override {
        if (!StringUtils.isValidName(name)) revert InvalidProjectName();

        bytes32 key = StringUtils.nameHash(name);
        if (_projects[key].exists) revert ProjectAlreadyExists(key);
        if (_pendingProjects[key].exists) revert RegistrationPending(key);

        string memory normalized = StringUtils.normalize(name);

        // Validate proofs - ecrecover for DEPLOYER_SIG happens immediately
        bytes32[] memory proofHashes = VerificationLib.validateProofs(msg.sender, normalized, proofs);

        // Store as pending - awaiting approver review
        PendingProject storage pending = _pendingProjects[key];
        pending.founder = msg.sender;
        pending.submittedAt = block.timestamp;
        pending.exists = true;
        for (uint256 i = 0; i < proofHashes.length; i++) {
            pending.proofHashes.push(proofHashes[i]);
        }

        emit RegistrationSubmitted(key, normalized, msg.sender, block.timestamp);
    }

    /// @inheritdoc IRegistry
    function approveRegistration(string calldata name) external override {
        if (msg.sender != owner && !isApprover[msg.sender]) revert NotApprover();

        bytes32 key = StringUtils.nameHash(name);
        PendingProject storage pending = _pendingProjects[key];
        if (!pending.exists) revert NoPendingRegistration(key);

        address pendingFounder = pending.founder;
        string memory normalized = StringUtils.normalize(name);
        uint256 deadline = block.timestamp + CHALLENGE_WINDOW;

        // Move proof hashes to the active project
        Project storage project = _projects[key];
        project.founder = pendingFounder;
        project.registeredAt = block.timestamp;
        project.challengeDeadline = deadline;
        project.exists = true;
        for (uint256 i = 0; i < pending.proofHashes.length; i++) {
            project.verificationProofs.push(pending.proofHashes[i]);
        }

        // Clear pending slot
        delete _pendingProjects[key];

        emit RegistrationApproved(key, normalized, msg.sender);
        emit ProjectRegistered(key, normalized, pendingFounder, deadline);
    }

    /// @inheritdoc IRegistry
    function rejectRegistration(string calldata name, string calldata reason) external override {
        if (msg.sender != owner && !isApprover[msg.sender]) revert NotApprover();

        bytes32 key = StringUtils.nameHash(name);
        if (!_pendingProjects[key].exists) revert NoPendingRegistration(key);

        string memory normalized = StringUtils.normalize(name);
        delete _pendingProjects[key];

        emit RegistrationRejected(key, normalized, msg.sender, reason);
    }

    /// @inheritdoc IRegistry
    function linkShield(string calldata name, address shieldContract) external override {
        if (msg.sender != shieldFactory) revert OnlyShieldFactory();

        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.shieldContract != address(0)) revert ShieldAlreadyLinked();

        project.shieldContract = shieldContract;

        emit ShieldLinked(key, shieldContract);
    }

    // ─── Token Authorization ──────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function authorizeToken(string calldata name, address tokenContract) external override {
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);
        if (_authorizedTokens[key][tokenContract]) revert TokenAlreadyAuthorized(tokenContract);

        _authorizedTokens[key][tokenContract] = true;

        emit TokenAuthorized(key, tokenContract, msg.sender);
    }

    /// @inheritdoc IRegistry
    function revokeToken(string calldata name, address tokenContract) external override {
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);
        if (!_authorizedTokens[key][tokenContract]) revert TokenNotAuthorized(tokenContract);

        _authorizedTokens[key][tokenContract] = false;

        emit TokenRevoked(key, tokenContract, msg.sender);
    }

    // ─── Address Management ───────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function addAddress(string calldata name, address additionalAddress) external override {
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);

        project.additionalAddresses.push(additionalAddress);

        emit AddressAdded(key, additionalAddress);
    }

    // ─── Reporting ────────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function reportUnauthorizedToken(string calldata name, address tokenContract) external override {
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (_authorizedTokens[key][tokenContract]) revert TokenIsAuthorized(tokenContract);

        // Increment reporter score
        reporterScore[msg.sender]++;

        string memory normalized = StringUtils.normalize(name);
        emit UnauthorizedTokenReported(key, normalized, tokenContract, msg.sender);

        // Forward to Shield contract if linked
        if (project.shieldContract != address(0)) {
            // Shield.onUnauthorizedTokenReported - non-reverting call
            (bool success,) = project.shieldContract.call(
                abi.encodeWithSignature(
                    "onUnauthorizedTokenReported(address,address)",
                    tokenContract,
                    msg.sender
                )
            );
            // Ignore failure - reporting is still valid even if Shield call fails
            (success); // silence unused var warning
        }
    }

    // ─── Dispute Mechanism ────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function disputeRegistration(
        string calldata name,
        string calldata reason,
        VerificationLib.Proof[] calldata proofs
    ) external override {
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (block.timestamp > project.challengeDeadline) revert ChallengeWindowClosed();

        string memory normalized = StringUtils.normalize(name);

        // Challenger must provide at least 2 valid proofs
        bytes32[] memory newProofHashes = VerificationLib.validateProofs(msg.sender, normalized, proofs);

        emit DisputeRaised(key, msg.sender, reason);

        // Simple dispute resolution: if challenger provides MORE proofs than original,
        // transfer registration. In practice, disputes require human governance or
        // a more sophisticated onchain mechanism.
        // For v1: emit event and allow off-chain resolution. The challenge window serves
        // as a deterrent against squatting.
        if (newProofHashes.length > project.verificationProofs.length) {
            address oldFounder = project.founder;
            project.founder = msg.sender;
            project.verificationProofs = newProofHashes;
            project.challengeDeadline = block.timestamp; // Close window after takeover

            emit DisputeResolved(key, msg.sender);
            (oldFounder); // silence unused warning
        }
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function isAuthorized(string calldata name, address tokenContract)
        external
        view
        override
        returns (bool)
    {
        bytes32 key = StringUtils.nameHash(name);
        if (!_projects[key].exists) return false;
        return _authorizedTokens[key][tokenContract];
    }

    /// @inheritdoc IRegistry
    function getProjectInfo(string calldata name)
        external
        view
        override
        returns (ProjectView memory)
    {
        bytes32 key = StringUtils.nameHash(name);
        Project storage p = _projects[key];
        return ProjectView({
            founder: p.founder,
            additionalAddresses: p.additionalAddresses,
            shieldContract: p.shieldContract,
            verificationProofs: p.verificationProofs,
            registeredAt: p.registeredAt,
            challengeDeadline: p.challengeDeadline,
            exists: p.exists
        });
    }

    /// @inheritdoc IRegistry
    function getPendingInfo(string calldata name)
        external
        view
        override
        returns (PendingProjectView memory)
    {
        bytes32 key = StringUtils.nameHash(name);
        PendingProject storage p = _pendingProjects[key];
        return PendingProjectView({
            founder: p.founder,
            proofHashes: p.proofHashes,
            submittedAt: p.submittedAt,
            exists: p.exists
        });
    }

    /// @inheritdoc IRegistry
    function getFounder(string calldata name) external view override returns (address) {
        bytes32 key = StringUtils.nameHash(name);
        return _projects[key].founder;
    }

    /// @inheritdoc IRegistry
    function isRegistered(string calldata name) external view override returns (bool) {
        return _projects[StringUtils.nameHash(name)].exists;
    }

    /// @inheritdoc IRegistry
    function isPending(string calldata name) external view override returns (bool) {
        return _pendingProjects[StringUtils.nameHash(name)].exists;
    }

    /// @notice Check if a token is authorized by raw name hash (gas-optimized for integrations)
    /// @param nameHash_ keccak256 of the normalized project name
    /// @param tokenContract Token contract address
    /// @return True if authorized
    function isAuthorizedByHash(bytes32 nameHash_, address tokenContract)
        external
        view
        returns (bool)
    {
        return _projects[nameHash_].exists && _authorizedTokens[nameHash_][tokenContract];
    }
}
