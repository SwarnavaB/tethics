// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRegistry} from "./interfaces/IRegistry.sol";
import {VerificationLib} from "./libraries/VerificationLib.sol";
import {StringUtils} from "./libraries/StringUtils.sol";

/// @title Registry
/// @notice Immutable, ownerless onchain registry of verified projects and their authorized tokens.
///         Deployed once per chain; acts as a public utility.
/// @dev    Founders register with multi-signal proofs. Anyone can query authorization status.
///         No admin keys, no upgrades, no owner.
contract Registry is IRegistry {
    using VerificationLib for VerificationLib.Proof[];
    using StringUtils for string;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Duration of the challenge window after registration (48 hours)
    uint256 public constant CHALLENGE_WINDOW = 48 hours;

    /// @notice Address of the ShieldFactory - only it may call linkShield
    address public immutable shieldFactory;

    // ─── Storage ─────────────────────────────────────────────────────────────

    struct Project {
        address founder;
        address[] additionalAddresses;
        address shieldContract;
        bytes32[] verificationProofs;
        uint256 registeredAt;
        uint256 challengeDeadline;
        bool exists;
    }

    /// @dev projectName hash → Project
    mapping(bytes32 => Project) private _projects;

    /// @dev projectName hash → tokenContract → authorized
    mapping(bytes32 => mapping(address => bool)) private _authorizedTokens;

    /// @dev reporter address → number of successful reports
    mapping(address => uint256) public reporterScore;

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _shieldFactory Address of the ShieldFactory contract (immutable after deploy)
    constructor(address _shieldFactory) {
        shieldFactory = _shieldFactory;
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /// @inheritdoc IRegistry
    function register(string calldata name, VerificationLib.Proof[] calldata proofs) external override {
        if (!StringUtils.isValidName(name)) revert InvalidProjectName();

        bytes32 key = StringUtils.nameHash(name);
        if (_projects[key].exists) revert ProjectAlreadyExists(key);

        string memory normalized = StringUtils.normalize(name);

        // Validate proofs - reverts on invalid
        bytes32[] memory proofHashes = VerificationLib.validateProofs(msg.sender, normalized, proofs);

        uint256 deadline = block.timestamp + CHALLENGE_WINDOW;

        _projects[key] = Project({
            founder: msg.sender,
            additionalAddresses: new address[](0),
            shieldContract: address(0),
            verificationProofs: proofHashes,
            registeredAt: block.timestamp,
            challengeDeadline: deadline,
            exists: true
        });

        emit ProjectRegistered(key, normalized, msg.sender, deadline);
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
    function getFounder(string calldata name) external view override returns (address) {
        bytes32 key = StringUtils.nameHash(name);
        return _projects[key].founder;
    }

    /// @inheritdoc IRegistry
    function isRegistered(string calldata name) external view override returns (bool) {
        return _projects[StringUtils.nameHash(name)].exists;
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
