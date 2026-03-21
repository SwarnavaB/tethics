// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRegistry} from "../interfaces/IRegistry.sol";
import {VerificationLib} from "../libraries/VerificationLib.sol";
import {StringUtils} from "../libraries/StringUtils.sol";
import {Initializable} from "./Initializable.sol";

/// @title UpgradeableRegistry
/// @notice Upgradeable reference implementation of the tethics registry.
/// @dev Uses initializer-based setup for proxy deployments. The shield factory
///      reference is mutable by the owner so proxy deployments can bootstrap
///      the registry/factory dependency without constructor-time immutables.
contract UpgradeableRegistry is IRegistry, Initializable {
    using VerificationLib for VerificationLib.Proof[];
    using StringUtils for string;

    uint256 public constant CHALLENGE_WINDOW = 48 hours;

    event ShieldFactoryUpdated(address indexed previousFactory, address indexed newFactory);

    address public shieldFactory;
    address public owner;
    mapping(address => bool) public isApprover;
    mapping(address => bool) public isCharityManager;

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

    struct ExternalClaim {
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

    struct ExternalAsset {
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

    struct ExternalAssetInput {
        bytes32 nameHash;
        bytes32 assetKey;
        string name;
        string ecosystem;
        string assetType;
        string assetId;
    }

    struct CharityOption {
        string name;
        address payoutAddress;
        string metadataURI;
        bool active;
        uint256 createdAt;
        uint256 updatedAt;
        bool exists;
    }

    mapping(bytes32 => Project) private _projects;
    mapping(bytes32 => PendingProject) private _pendingProjects;
    mapping(bytes32 => mapping(address => bool)) private _authorizedTokens;
    mapping(address => uint256) public reporterScore;
    mapping(bytes32 => mapping(address => mapping(address => bool))) private _unauthorizedReports;
    uint256 public externalClaimCount;
    mapping(uint256 => ExternalClaim) private _externalClaims;
    mapping(bytes32 => mapping(bytes32 => ExternalAsset)) private _externalAssets;
    uint256 public charityOptionCount;
    mapping(uint256 => CharityOption) private _charityOptions;

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address initialShieldFactory) external initializer {
        if (initialOwner == address(0)) revert ZeroOwner();
        owner = initialOwner;
        shieldFactory = initialShieldFactory;
        emit OwnershipTransferred(address(0), initialOwner);
        emit ShieldFactoryUpdated(address(0), initialShieldFactory);
    }

    function setShieldFactory(address newShieldFactory) external {
        if (msg.sender != owner) revert NotOwner();
        if (newShieldFactory == address(0)) revert InvalidShieldContract();
        address previous = shieldFactory;
        shieldFactory = newShieldFactory;
        emit ShieldFactoryUpdated(previous, newShieldFactory);
    }

    function transferOwnership(address newOwner) external override {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addApprover(address approver) external override {
        if (msg.sender != owner) revert NotOwner();
        if (approver == address(0)) revert InvalidApproverAddress();
        isApprover[approver] = true;
        emit ApproverAdded(approver);
    }

    function removeApprover(address approver) external override {
        if (msg.sender != owner) revert NotOwner();
        if (approver == address(0)) revert InvalidApproverAddress();
        isApprover[approver] = false;
        emit ApproverRemoved(approver);
    }

    function addCharityManager(address manager) external override {
        if (msg.sender != owner) revert NotOwner();
        if (manager == address(0)) revert InvalidCharityManagerAddress();
        isCharityManager[manager] = true;
        emit CharityManagerAdded(manager);
    }

    function removeCharityManager(address manager) external override {
        if (msg.sender != owner) revert NotOwner();
        if (manager == address(0)) revert InvalidCharityManagerAddress();
        isCharityManager[manager] = false;
        emit CharityManagerRemoved(manager);
    }

    function addCharityOption(
        string calldata name,
        address payoutAddress,
        string calldata metadataURI
    ) external override returns (uint256 charityId) {
        if (!_canManageCharityCatalog(msg.sender)) revert NotOwner();
        charityId = ++charityOptionCount;
        _setCharityOption(charityId, name, payoutAddress, metadataURI, true, true);
    }

    function updateCharityOption(
        uint256 charityId,
        string calldata name,
        address payoutAddress,
        string calldata metadataURI,
        bool active
    ) external override {
        if (!_canManageCharityCatalog(msg.sender)) revert NotOwner();
        if (!_charityOptions[charityId].exists) revert NoCharityOption(charityId);
        _setCharityOption(charityId, name, payoutAddress, metadataURI, active, false);
    }

    function register(string calldata name, VerificationLib.Proof[] calldata proofs) external override {
        if (!StringUtils.isValidName(name)) revert InvalidProjectName();

        bytes32 key = StringUtils.nameHash(name);
        if (_projects[key].exists) revert ProjectAlreadyExists(key);
        if (_pendingProjects[key].exists) revert RegistrationPending(key);

        string memory normalized = StringUtils.normalize(name);
        bytes32[] memory proofHashes = VerificationLib.validateProofs(msg.sender, normalized, proofs);

        PendingProject storage pending = _pendingProjects[key];
        pending.founder = msg.sender;
        pending.submittedAt = block.timestamp;
        pending.exists = true;
        for (uint256 i = 0; i < proofHashes.length; i++) {
            pending.proofHashes.push(proofHashes[i]);
        }

        emit RegistrationSubmitted(key, normalized, msg.sender, block.timestamp);
    }

    function approveRegistration(string calldata name) external override {
        if (msg.sender != owner && !isApprover[msg.sender]) revert NotApprover();

        bytes32 key = StringUtils.nameHash(name);
        PendingProject storage pending = _pendingProjects[key];
        if (!pending.exists) revert NoPendingRegistration(key);

        address pendingFounder = pending.founder;
        string memory normalized = StringUtils.normalize(name);
        uint256 deadline = block.timestamp + CHALLENGE_WINDOW;

        Project storage project = _projects[key];
        project.founder = pendingFounder;
        project.registeredAt = block.timestamp;
        project.challengeDeadline = deadline;
        project.exists = true;
        for (uint256 i = 0; i < pending.proofHashes.length; i++) {
            project.verificationProofs.push(pending.proofHashes[i]);
        }

        delete _pendingProjects[key];

        emit RegistrationApproved(key, normalized, msg.sender);
        emit ProjectRegistered(key, normalized, pendingFounder, deadline);
    }

    function rejectRegistration(string calldata name, string calldata reason) external override {
        if (msg.sender != owner && !isApprover[msg.sender]) revert NotApprover();

        bytes32 key = StringUtils.nameHash(name);
        if (!_pendingProjects[key].exists) revert NoPendingRegistration(key);

        string memory normalized = StringUtils.normalize(name);
        delete _pendingProjects[key];

        emit RegistrationRejected(key, normalized, msg.sender, reason);
    }

    function linkShield(string calldata name, address shieldContract) external override {
        if (msg.sender != shieldFactory) revert OnlyShieldFactory();
        if (shieldContract == address(0)) revert InvalidShieldContract();

        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.shieldContract != address(0)) revert ShieldAlreadyLinked();

        project.shieldContract = shieldContract;
        emit ShieldLinked(key, shieldContract);
    }

    function authorizeToken(string calldata name, address tokenContract) external override {
        if (tokenContract == address(0)) revert InvalidTokenContract();
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);
        if (_authorizedTokens[key][tokenContract]) revert TokenAlreadyAuthorized(tokenContract);

        _authorizedTokens[key][tokenContract] = true;
        emit TokenAuthorized(key, tokenContract, msg.sender);
    }

    function revokeToken(string calldata name, address tokenContract) external override {
        if (tokenContract == address(0)) revert InvalidTokenContract();
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);
        if (!_authorizedTokens[key][tokenContract]) revert TokenNotAuthorized(tokenContract);

        _authorizedTokens[key][tokenContract] = false;
        emit TokenRevoked(key, tokenContract, msg.sender);
    }

    function addAddress(string calldata name, address additionalAddress) external override {
        if (additionalAddress == address(0)) revert InvalidAdditionalAddress();
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (project.founder != msg.sender) revert NotFounder(msg.sender, project.founder);

        project.additionalAddresses.push(additionalAddress);
        emit AddressAdded(key, additionalAddress);
    }

    function reportUnauthorizedToken(string calldata name, address tokenContract) external override {
        if (tokenContract == address(0)) revert InvalidTokenContract();
        bytes32 key = StringUtils.nameHash(name);
        Project storage project = _projects[key];
        if (!project.exists) revert ProjectNotFound(key);
        if (_authorizedTokens[key][tokenContract]) revert TokenIsAuthorized(tokenContract);
        if (_unauthorizedReports[key][tokenContract][msg.sender]) {
            revert DuplicateUnauthorizedReport(msg.sender, tokenContract);
        }

        _unauthorizedReports[key][tokenContract][msg.sender] = true;
        reporterScore[msg.sender]++;

        string memory normalized = StringUtils.normalize(name);
        emit UnauthorizedTokenReported(key, normalized, tokenContract, msg.sender);

        if (project.shieldContract != address(0)) {
            (bool success,) = project.shieldContract.call(
                abi.encodeWithSignature(
                    "onUnauthorizedTokenReported(address,address)",
                    tokenContract,
                    msg.sender
                )
            );
            (success);
        }
    }

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
        bytes32[] memory newProofHashes = VerificationLib.validateProofs(msg.sender, normalized, proofs);
        emit DisputeRaised(key, msg.sender, reason);
        (newProofHashes);
    }

    function submitExternalClaim(
        string calldata name,
        string calldata ecosystem,
        bytes32 payloadHash,
        string calldata metadataURI
    ) external override returns (uint256 claimId) {
        if (!StringUtils.isValidName(name)) revert InvalidProjectName();
        if (bytes(ecosystem).length == 0) revert InvalidEcosystem();
        if (payloadHash == bytes32(0)) revert EmptyPayloadHash();
        if (bytes(_trim(metadataURI)).length == 0) revert MissingMetadataURI();

        string memory normalized = StringUtils.normalize(name);
        bytes32 key = StringUtils.nameHash(name);

        claimId = ++externalClaimCount;
        ExternalClaim storage claim = _externalClaims[claimId];
        claim.nameHash = key;
        claim.name = normalized;
        claim.ecosystem = ecosystem;
        claim.proposer = msg.sender;
        claim.payloadHash = payloadHash;
        claim.metadataURI = _trim(metadataURI);
        claim.submittedAt = block.timestamp;
        claim.exists = true;

        emit ExternalClaimSubmitted(
            claimId,
            key,
            normalized,
            ecosystem,
            msg.sender,
            payloadHash,
            metadataURI
        );
    }

    function reviewExternalClaim(
        uint256 claimId,
        bool approved,
        string calldata reviewNotes,
        bytes32 resolutionHash,
        string calldata resolutionURI
    ) external override {
        if (msg.sender != owner && !isApprover[msg.sender]) revert NotApprover();
        if (resolutionHash == bytes32(0)) revert MissingResolutionHash();
        if (bytes(_trim(resolutionURI)).length == 0) revert MissingResolutionURI();

        ExternalClaim storage claim = _externalClaims[claimId];
        if (!claim.exists) revert NoExternalClaim(claimId);
        if (claim.reviewed) revert ExternalClaimAlreadyReviewed(claimId);

        claim.reviewed = true;
        claim.approved = approved;
        claim.reviewer = msg.sender;
        claim.reviewedAt = block.timestamp;
        claim.resolutionHash = resolutionHash;
        claim.resolutionURI = _trim(resolutionURI);
        claim.reviewNotes = reviewNotes;

        emit ExternalClaimReviewed(
            claimId,
            claim.nameHash,
            claim.name,
            claim.ecosystem,
            msg.sender,
            approved,
            resolutionHash,
            resolutionURI,
            reviewNotes
        );
    }

    function authorizeExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId,
        string calldata metadataURI
    ) external override {
        ExternalAssetInput memory input = _normalizeExternalAsset(name, ecosystem, assetType, assetId);
        if (!_canManageExternalAssets(input.nameHash, msg.sender)) revert NotExternalAssetManager(msg.sender);
        if (bytes(_trim(metadataURI)).length == 0) revert MissingMetadataURI();

        ExternalAsset storage asset = _externalAssets[input.nameHash][input.assetKey];
        asset.nameHash = input.nameHash;
        asset.name = input.name;
        asset.ecosystem = input.ecosystem;
        asset.assetType = input.assetType;
        asset.assetId = input.assetId;
        asset.metadataURI = _trim(metadataURI);
        asset.authorized = true;
        asset.updatedBy = msg.sender;
        asset.updatedAt = block.timestamp;
        asset.exists = true;

        emit ExternalAssetAuthorized(
            input.nameHash,
            input.assetKey,
            input.name,
            input.ecosystem,
            input.assetType,
            input.assetId,
            msg.sender,
            metadataURI
        );
    }

    function revokeExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId,
        string calldata metadataURI
    ) external override {
        ExternalAssetInput memory input = _normalizeExternalAsset(name, ecosystem, assetType, assetId);
        if (!_canManageExternalAssets(input.nameHash, msg.sender)) revert NotExternalAssetManager(msg.sender);
        if (bytes(_trim(metadataURI)).length == 0) revert MissingMetadataURI();

        ExternalAsset storage asset = _externalAssets[input.nameHash][input.assetKey];
        if (!asset.exists) revert NoExternalAsset(input.assetKey);

        asset.metadataURI = _trim(metadataURI);
        asset.authorized = false;
        asset.updatedBy = msg.sender;
        asset.updatedAt = block.timestamp;

        emit ExternalAssetRevoked(
            input.nameHash,
            input.assetKey,
            input.name,
            input.ecosystem,
            input.assetType,
            input.assetId,
            msg.sender,
            metadataURI
        );
    }

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

    function getFounder(string calldata name) external view override returns (address) {
        bytes32 key = StringUtils.nameHash(name);
        return _projects[key].founder;
    }

    function isRegistered(string calldata name) external view override returns (bool) {
        return _projects[StringUtils.nameHash(name)].exists;
    }

    function isPending(string calldata name) external view override returns (bool) {
        return _pendingProjects[StringUtils.nameHash(name)].exists;
    }

    function getExternalClaim(uint256 claimId)
        external
        view
        override
        returns (ExternalClaimView memory)
    {
        ExternalClaim storage claim = _externalClaims[claimId];
        return ExternalClaimView({
            claimId: claimId,
            nameHash: claim.nameHash,
            name: claim.name,
            ecosystem: claim.ecosystem,
            proposer: claim.proposer,
            payloadHash: claim.payloadHash,
            metadataURI: claim.metadataURI,
            submittedAt: claim.submittedAt,
            exists: claim.exists,
            reviewed: claim.reviewed,
            approved: claim.approved,
            reviewer: claim.reviewer,
            reviewedAt: claim.reviewedAt,
            resolutionHash: claim.resolutionHash,
            resolutionURI: claim.resolutionURI,
            reviewNotes: claim.reviewNotes
        });
    }

    function getExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId
    ) external view override returns (ExternalAssetView memory) {
        bytes32 key = StringUtils.nameHash(name);
        bytes32 assetKey = _externalAssetKey(
            StringUtils.normalize(ecosystem),
            StringUtils.normalize(assetType),
            _trim(assetId)
        );

        ExternalAsset storage asset = _externalAssets[key][assetKey];
        return ExternalAssetView({
            nameHash: asset.nameHash,
            name: asset.name,
            ecosystem: asset.ecosystem,
            assetType: asset.assetType,
            assetId: asset.assetId,
            metadataURI: asset.metadataURI,
            authorized: asset.authorized,
            updatedBy: asset.updatedBy,
            updatedAt: asset.updatedAt,
            exists: asset.exists
        });
    }

    function getCharityOption(uint256 charityId) external view override returns (CharityOptionView memory) {
        CharityOption storage option = _charityOptions[charityId];
        return CharityOptionView({
            charityId: charityId,
            name: option.name,
            payoutAddress: option.payoutAddress,
            metadataURI: option.metadataURI,
            active: option.active,
            createdAt: option.createdAt,
            updatedAt: option.updatedAt,
            exists: option.exists
        });
    }

    function isAuthorizedByHash(bytes32 nameHash_, address tokenContract)
        external
        view
        returns (bool)
    {
        return _projects[nameHash_].exists && _authorizedTokens[nameHash_][tokenContract];
    }

    function _canManageExternalAssets(bytes32 nameHash_, address caller) internal view returns (bool) {
        if (caller == owner || isApprover[caller]) return true;
        Project storage project = _projects[nameHash_];
        return project.exists && project.founder == caller;
    }

    function _externalAssetKey(
        string memory ecosystem,
        string memory assetType,
        string memory assetId
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "tethics:asset:",
                ecosystem,
                ":",
                assetType,
                ":",
                assetId
            )
        );
    }

    function _normalizeExternalAsset(
        string calldata name,
        string calldata ecosystem,
        string calldata assetType,
        string calldata assetId
    ) internal pure returns (ExternalAssetInput memory input) {
        input.nameHash = StringUtils.nameHash(name);
        input.name = StringUtils.normalize(name);
        input.ecosystem = StringUtils.normalize(ecosystem);
        input.assetType = StringUtils.normalize(assetType);
        input.assetId = _trim(assetId);

        if (bytes(input.ecosystem).length == 0) revert InvalidEcosystem();
        if (bytes(input.assetType).length == 0) revert InvalidAssetType();
        if (bytes(input.assetId).length == 0) revert InvalidAssetId();

        input.assetKey = _externalAssetKey(input.ecosystem, input.assetType, input.assetId);
    }

    function _trim(string memory input) internal pure returns (string memory trimmed) {
        bytes memory b = bytes(input);
        uint256 start = 0;
        uint256 end = b.length;

        while (start < end && b[start] == 0x20) {
            start++;
        }
        while (end > start && b[end - 1] == 0x20) {
            end--;
        }

        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = b[i];
        }
        return string(result);
    }

    function _setCharityOption(
        uint256 charityId,
        string calldata name,
        address payoutAddress,
        string calldata metadataURI,
        bool active,
        bool isNew
    ) internal {
        string memory trimmedName = _trim(name);
        string memory trimmedMetadataURI = _trim(metadataURI);
        if (bytes(trimmedName).length == 0) revert InvalidCharityName();
        if (payoutAddress == address(0)) revert InvalidCharityAddress();
        if (bytes(trimmedMetadataURI).length == 0) revert MissingMetadataURI();

        CharityOption storage option = _charityOptions[charityId];
        option.name = trimmedName;
        option.payoutAddress = payoutAddress;
        option.metadataURI = trimmedMetadataURI;
        option.active = active;
        option.updatedAt = block.timestamp;
        if (isNew) {
            option.createdAt = block.timestamp;
            option.exists = true;
        }

        emit CharityOptionConfigured(
            charityId,
            trimmedName,
            payoutAddress,
            trimmedMetadataURI,
            active,
            msg.sender
        );
    }

    function _canManageCharityCatalog(address caller) internal view returns (bool) {
        return caller == owner || isCharityManager[caller];
    }
}
