// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";
import {IRegistry} from "../src/interfaces/IRegistry.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";
import {StringUtils} from "../src/libraries/StringUtils.sol";

/// @title RegistryTest
/// @notice Unit tests for Registry.sol
contract RegistryTest is Test {
    Registry public registry;
    address public factory = makeAddr("factory");
    address public alice = makeAddr("alice");

    uint256 public founderKey = 0xA11CE;
    address public founder;
    uint256 public challengerKey = 0xB0B;
    address public challenger;

    event ProjectRegistered(bytes32 indexed nameHash, string name, address indexed founder, uint256 challengeDeadline);
    event RegistrationSubmitted(bytes32 indexed nameHash, string name, address indexed founder, uint256 submittedAt);
    event RegistrationApproved(bytes32 indexed nameHash, string name, address indexed approver);
    event RegistrationRejected(bytes32 indexed nameHash, string name, address indexed approver, string reason);
    event TokenAuthorized(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);
    event TokenRevoked(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);
    event UnauthorizedTokenReported(bytes32 indexed nameHash, string name, address indexed tokenContract, address indexed reporter);
    event ShieldLinked(bytes32 indexed nameHash, address indexed shieldContract);
    event ApproverAdded(address indexed approver);
    event ApproverRemoved(address indexed approver);
    event CharityManagerAdded(address indexed manager);
    event CharityManagerRemoved(address indexed manager);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ExternalClaimSubmitted(
        uint256 indexed claimId,
        bytes32 indexed nameHash,
        string name,
        string ecosystem,
        address indexed proposer,
        bytes32 payloadHash,
        string metadataURI
    );
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
    event CharityOptionConfigured(
        uint256 indexed charityId,
        string name,
        address indexed payoutAddress,
        string metadataURI,
        bool active,
        address indexed actor
    );

    function setUp() public {
        founder = vm.addr(founderKey);
        challenger = vm.addr(challengerKey);
        // Test contract (address(this)) becomes the owner
        registry = new Registry(factory);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @dev Build a deployer-sig proof. NOT pure - calls vm.sign cheatcode.
    function _makeDeployerSigProof(
        address signerAddr,
        uint256 signerKey,
        string memory name,
        address _founder
    ) internal returns (VerificationLib.Proof memory) {
        bytes32 inner = keccak256(
            abi.encodePacked("tethics:register:", name, ":", _founder)
        );
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", inner)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, ethHash);
        return VerificationLib.Proof({
            proofType: VerificationLib.PROOF_DEPLOYER_SIG,
            data: abi.encode(signerAddr, abi.encodePacked(r, s, v))
        });
    }

    function _makeENSProof(string memory ensName)
        internal
        pure
        returns (VerificationLib.Proof memory)
    {
        return VerificationLib.Proof({
            proofType: VerificationLib.PROOF_ENS,
            data: abi.encode(ensName)
        });
    }

    function _getProofs(string memory name)
        internal
        returns (VerificationLib.Proof[] memory proofs)
    {
        proofs = new VerificationLib.Proof[](2);
        proofs[0] = _makeDeployerSigProof(founder, founderKey, name, founder);
        proofs[1] = _makeENSProof("myproject.eth");
    }

    function _getProofsFor(address signer, uint256 signerKey, string memory name, string memory ensName)
        internal
        returns (VerificationLib.Proof[] memory proofs)
    {
        proofs = new VerificationLib.Proof[](2);
        proofs[0] = _makeDeployerSigProof(signer, signerKey, name, signer);
        proofs[1] = _makeENSProof(ensName);
    }

    /// @dev Register and approve a project. Test contract is owner so no prank needed for approve.
    function _registerProject(string memory name) internal {
        VerificationLib.Proof[] memory proofs = _getProofs(name);
        vm.prank(founder);
        registry.register(name, proofs);
        // Test contract is the owner - approve directly
        registry.approveRegistration(name);
    }

    // ─── Registration / Pending Tests ─────────────────────────────────────────

    function test_register_creates_pending() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        vm.prank(founder);
        registry.register("myproject", proofs);

        // Not yet registered - pending approval
        assertFalse(registry.isRegistered("myproject"));
        assertTrue(registry.isPending("myproject"));

        IRegistry.PendingProjectView memory pv = registry.getPendingInfo("myproject");
        assertTrue(pv.exists);
        assertEq(pv.founder, founder);
        assertGt(pv.submittedAt, 0);
        assertEq(pv.proofHashes.length, 2);
    }

    function test_register_emits_RegistrationSubmitted() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        bytes32 expectedHash = StringUtils.nameHash("myproject");

        vm.prank(founder);
        vm.expectEmit(true, true, false, false);
        emit RegistrationSubmitted(expectedHash, "myproject", founder, block.timestamp);
        registry.register("myproject", proofs);
    }

    function test_approveRegistration_success() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        bytes32 expectedHash = StringUtils.nameHash("myproject");
        uint256 expectedDeadline = block.timestamp + registry.CHALLENGE_WINDOW();

        vm.expectEmit(true, false, true, false);
        emit RegistrationApproved(expectedHash, "myproject", address(this));
        vm.expectEmit(true, true, false, false);
        emit ProjectRegistered(expectedHash, "myproject", founder, expectedDeadline);
        registry.approveRegistration("myproject");

        // Now registered and pending cleared
        assertTrue(registry.isRegistered("myproject"));
        assertFalse(registry.isPending("myproject"));

        IRegistry.ProjectView memory info = registry.getProjectInfo("myproject");
        assertTrue(info.exists);
        assertEq(info.founder, founder);
        assertGt(info.challengeDeadline, block.timestamp);
        assertEq(info.verificationProofs.length, 2);
    }

    function test_rejectRegistration_success() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        bytes32 expectedHash = StringUtils.nameHash("myproject");

        vm.expectEmit(true, false, true, true);
        emit RegistrationRejected(expectedHash, "myproject", address(this), "insufficient proof");
        registry.rejectRegistration("myproject", "insufficient proof");

        // Cleared from pending
        assertFalse(registry.isPending("myproject"));
        assertFalse(registry.isRegistered("myproject"));

        // Founder can re-apply after rejection
        vm.prank(founder);
        registry.register("myproject", proofs);
        assertTrue(registry.isPending("myproject"));
    }

    function test_approveRegistration_byDelegatedApprover() public {
        address approver = makeAddr("approver");
        registry.addApprover(approver);

        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        vm.prank(approver);
        registry.approveRegistration("myproject");

        assertTrue(registry.isRegistered("myproject"));
    }

    function test_approve_nonApprover_reverts() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotApprover.selector);
        registry.approveRegistration("myproject");
    }

    function test_approve_noPending_reverts() public {
        bytes32 key = StringUtils.nameHash("nonexistent");
        vm.expectRevert(abi.encodeWithSelector(IRegistry.NoPendingRegistration.selector, key));
        registry.approveRegistration("nonexistent");
    }

    function test_reject_nonApprover_reverts() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotApprover.selector);
        registry.rejectRegistration("myproject", "reason");
    }

    function test_register_rejects_pending_duplicate() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        // Second submission while first is pending
        bytes32 key = StringUtils.nameHash("myproject");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.RegistrationPending.selector, key));
        registry.register("myproject", proofs);
    }

    function test_register_rejects_already_registered() public {
        _registerProject("myproject"); // register + approve

        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        bytes32 key = StringUtils.nameHash("myproject");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.ProjectAlreadyExists.selector, key));
        registry.register("myproject", proofs);
    }

    function test_register_normalizes_name() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        vm.prank(founder);
        registry.register("  MyProject  ", proofs);
        registry.approveRegistration("  MyProject  ");

        assertTrue(registry.isRegistered("myproject"));
        assertTrue(registry.isRegistered("  MyProject  "));
        assertEq(registry.getFounder("myproject"), registry.getFounder("  MyProject  "));
    }

    function test_register_rejects_invalid_name() public {
        VerificationLib.Proof[] memory proofs = _getProofs("ab");

        vm.prank(founder);
        vm.expectRevert(IRegistry.InvalidProjectName.selector);
        registry.register("a", proofs); // too short

        vm.expectRevert(IRegistry.InvalidProjectName.selector);
        registry.register("has spaces", proofs);
    }

    function test_register_requires_two_proofs() public {
        VerificationLib.Proof[] memory proofs = new VerificationLib.Proof[](1);
        proofs[0] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);

        vm.prank(founder);
        vm.expectRevert(VerificationLib.InsufficientProofs.selector);
        registry.register("myproject", proofs);
    }

    function test_submitExternalClaim_success() public {
        bytes32 payloadHash = keccak256("proposal");
        bytes32 expectedHash = StringUtils.nameHash("myproject");

        vm.prank(founder);
        vm.expectEmit(true, true, false, true);
        emit ExternalClaimSubmitted(
            1,
            expectedHash,
            "myproject",
            "SOLANA",
            founder,
            payloadHash,
            "ipfs://proposal"
        );
        uint256 claimId = registry.submitExternalClaim("myproject", "SOLANA", payloadHash, "ipfs://proposal");

        IRegistry.ExternalClaimView memory claim = registry.getExternalClaim(claimId);
        assertTrue(claim.exists);
        assertFalse(claim.reviewed);
        assertEq(claim.claimId, 1);
        assertEq(claim.nameHash, expectedHash);
        assertEq(claim.name, "myproject");
        assertEq(claim.ecosystem, "SOLANA");
        assertEq(claim.proposer, founder);
        assertEq(claim.payloadHash, payloadHash);
        assertEq(claim.metadataURI, "ipfs://proposal");
    }

    function test_submitExternalClaim_requiresPayloadHash() public {
        vm.prank(founder);
        vm.expectRevert(IRegistry.EmptyPayloadHash.selector);
        registry.submitExternalClaim("myproject", "SOLANA", bytes32(0), "ipfs://proposal");
    }

    function test_reviewExternalClaim_success() public {
        vm.prank(founder);
        uint256 claimId = registry.submitExternalClaim(
            "myproject",
            "SOLANA",
            keccak256("proposal"),
            "ipfs://proposal"
        );

        bytes32 resolutionHash = keccak256("resolution");

        vm.expectEmit(true, true, false, true);
        emit ExternalClaimReviewed(
            claimId,
            StringUtils.nameHash("myproject"),
            "myproject",
            "SOLANA",
            address(this),
            true,
            resolutionHash,
            "ipfs://bundle",
            "legitimate founder"
        );
        registry.reviewExternalClaim(
            claimId,
            true,
            "legitimate founder",
            resolutionHash,
            "ipfs://bundle"
        );

        IRegistry.ExternalClaimView memory claim = registry.getExternalClaim(claimId);
        assertTrue(claim.reviewed);
        assertTrue(claim.approved);
        assertEq(claim.reviewer, address(this));
        assertEq(claim.resolutionHash, resolutionHash);
        assertEq(claim.resolutionURI, "ipfs://bundle");
        assertEq(claim.reviewNotes, "legitimate founder");
    }

    function test_reviewExternalClaim_nonApprover_reverts() public {
        vm.prank(founder);
        uint256 claimId = registry.submitExternalClaim(
            "myproject",
            "SOLANA",
            keccak256("proposal"),
            "ipfs://proposal"
        );

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotApprover.selector);
        registry.reviewExternalClaim(claimId, false, "no authority", bytes32(0), "");
    }

    function test_reviewExternalClaim_cannotReviewTwice() public {
        vm.prank(founder);
        uint256 claimId = registry.submitExternalClaim(
            "myproject",
            "SOLANA",
            keccak256("proposal"),
            "ipfs://proposal"
        );

        registry.reviewExternalClaim(claimId, true, "approved", keccak256("bundle"), "ipfs://bundle");

        vm.expectRevert(abi.encodeWithSelector(IRegistry.ExternalClaimAlreadyReviewed.selector, claimId));
        registry.reviewExternalClaim(claimId, false, "rejected", keccak256("bundle-2"), "ipfs://bundle-2");
    }

    function test_reviewExternalClaim_requiresResolutionHash() public {
        vm.prank(founder);
        uint256 claimId = registry.submitExternalClaim(
            "myproject",
            "SOLANA",
            keccak256("proposal"),
            "ipfs://proposal"
        );

        vm.expectRevert(IRegistry.MissingResolutionHash.selector);
        registry.reviewExternalClaim(claimId, true, "approved", bytes32(0), "");
    }

    function test_submitExternalClaim_requiresMetadataURI() public {
        vm.prank(founder);
        vm.expectRevert(IRegistry.MissingMetadataURI.selector);
        registry.submitExternalClaim("myproject", "SOLANA", keccak256("proposal"), "   ");
    }

    function test_reviewExternalClaim_requiresResolutionURI() public {
        vm.prank(founder);
        uint256 claimId = registry.submitExternalClaim(
            "myproject",
            "SOLANA",
            keccak256("proposal"),
            "ipfs://proposal"
        );

        vm.expectRevert(IRegistry.MissingResolutionURI.selector);
        registry.reviewExternalClaim(claimId, true, "approved", keccak256("bundle"), "   ");
    }

    function test_register_rejects_duplicate_proof_category() public {
        VerificationLib.Proof[] memory proofs = new VerificationLib.Proof[](2);
        proofs[0] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);
        proofs[1] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);

        vm.prank(founder);
        vm.expectRevert(VerificationLib.DuplicateProofCategory.selector);
        registry.register("myproject", proofs);
    }

    function test_disputeRegistration_doesNotAutoTransferFounder() public {
        _registerProject("myproject");

        VerificationLib.Proof[] memory challengerProofs = _getProofsFor(
            challenger,
            challengerKey,
            "myproject",
            "challenger.eth"
        );

        vm.prank(challenger);
        registry.disputeRegistration("myproject", "contesting founder claim", challengerProofs);

        assertEq(registry.getFounder("myproject"), founder);
    }

    // ─── Governance Tests ─────────────────────────────────────────────────────

    function test_addApprover_onlyOwner() public {
        address approver = makeAddr("approver");

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.addApprover(approver);

        // Owner can add
        vm.expectEmit(true, false, false, false);
        emit ApproverAdded(approver);
        registry.addApprover(approver);

        assertTrue(registry.isApprover(approver));
    }

    function test_removeApprover_onlyOwner() public {
        address approver = makeAddr("approver");
        registry.addApprover(approver);

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.removeApprover(approver);

        vm.expectEmit(true, false, false, false);
        emit ApproverRemoved(approver);
        registry.removeApprover(approver);

        assertFalse(registry.isApprover(approver));
    }

    function test_transferOwnership() public {
        address newOwner = makeAddr("newOwner");

        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(address(this), newOwner);
        registry.transferOwnership(newOwner);

        assertEq(registry.owner(), newOwner);

        // Old owner can no longer add approvers
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.addApprover(alice);

        // New owner can add approvers
        vm.prank(newOwner);
        registry.addApprover(alice);
        assertTrue(registry.isApprover(alice));
    }

    function test_transferOwnership_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.transferOwnership(alice);
    }

    function test_transferOwnership_zeroAddress_reverts() public {
        vm.expectRevert(IRegistry.ZeroOwner.selector);
        registry.transferOwnership(address(0));
    }

    function test_addApprover_zeroAddress_reverts() public {
        vm.expectRevert(IRegistry.InvalidApproverAddress.selector);
        registry.addApprover(address(0));
    }

    function test_addCharityOption_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.addCharityOption("GiveDirectly", makeAddr("charity"), "ipfs://charity");
    }

    function test_addCharityManager_onlyOwner() public {
        address manager = makeAddr("manager");

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.addCharityManager(manager);

        vm.expectEmit(true, false, false, false);
        emit CharityManagerAdded(manager);
        registry.addCharityManager(manager);
        assertTrue(registry.isCharityManager(manager));
    }

    function test_removeCharityManager_onlyOwner() public {
        address manager = makeAddr("manager");
        registry.addCharityManager(manager);

        vm.prank(alice);
        vm.expectRevert(IRegistry.NotOwner.selector);
        registry.removeCharityManager(manager);

        vm.expectEmit(true, false, false, false);
        emit CharityManagerRemoved(manager);
        registry.removeCharityManager(manager);
        assertFalse(registry.isCharityManager(manager));
    }

    function test_addCharityOption_success() public {
        address payout = makeAddr("charity");

        vm.expectEmit(true, false, true, true);
        emit CharityOptionConfigured(1, "GiveDirectly", payout, "ipfs://charity", true, address(this));
        uint256 charityId = registry.addCharityOption("GiveDirectly", payout, "ipfs://charity");

        IRegistry.CharityOptionView memory option = registry.getCharityOption(charityId);
        assertEq(charityId, 1);
        assertTrue(option.exists);
        assertTrue(option.active);
        assertEq(option.payoutAddress, payout);
        assertEq(option.name, "GiveDirectly");
    }

    function test_updateCharityOption_success() public {
        address payout = makeAddr("charity");
        uint256 charityId = registry.addCharityOption("GiveDirectly", payout, "ipfs://charity");

        address newPayout = makeAddr("newCharity");
        registry.updateCharityOption(charityId, "Protocol Guild", newPayout, "ipfs://updated", false);

        IRegistry.CharityOptionView memory option = registry.getCharityOption(charityId);
        assertEq(option.name, "Protocol Guild");
        assertEq(option.payoutAddress, newPayout);
        assertEq(option.metadataURI, "ipfs://updated");
        assertFalse(option.active);
    }

    function test_charityManager_canManageCharityCatalog() public {
        address manager = makeAddr("manager");
        registry.addCharityManager(manager);

        vm.prank(manager);
        uint256 charityId = registry.addCharityOption("GiveDirectly", makeAddr("charity"), "ipfs://charity");

        vm.prank(manager);
        registry.updateCharityOption(charityId, "Updated", makeAddr("charity2"), "ipfs://updated", false);

        IRegistry.CharityOptionView memory option = registry.getCharityOption(charityId);
        assertEq(option.name, "Updated");
        assertFalse(option.active);
    }

    function test_addCharityOption_invalidInputs_revert() public {
        vm.expectRevert(IRegistry.InvalidCharityName.selector);
        registry.addCharityOption(" ", makeAddr("charity"), "ipfs://charity");

        vm.expectRevert(IRegistry.InvalidCharityAddress.selector);
        registry.addCharityOption("GiveDirectly", address(0), "ipfs://charity");

        vm.expectRevert(IRegistry.MissingMetadataURI.selector);
        registry.addCharityOption("GiveDirectly", makeAddr("charity"), " ");
    }

    function test_addCharityManager_zeroAddress_reverts() public {
        vm.expectRevert(IRegistry.InvalidCharityManagerAddress.selector);
        registry.addCharityManager(address(0));
    }

    // ─── Token Authorization Tests ────────────────────────────────────────────

    function test_authorizeToken() public {
        _registerProject("myproject");

        address token = makeAddr("token");
        vm.prank(founder);
        vm.expectEmit(true, true, true, false);
        emit TokenAuthorized(StringUtils.nameHash("myproject"), token, founder);
        registry.authorizeToken("myproject", token);

        assertTrue(registry.isAuthorized("myproject", token));
    }

    function test_authorizeToken_onlyFounder() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.NotFounder.selector, alice, founder));
        registry.authorizeToken("myproject", token);
    }

    function test_authorizeToken_zeroAddress_reverts() public {
        _registerProject("myproject");

        vm.prank(founder);
        vm.expectRevert(IRegistry.InvalidTokenContract.selector);
        registry.authorizeToken("myproject", address(0));
    }

    function test_revokeToken() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.startPrank(founder);
        registry.authorizeToken("myproject", token);
        assertTrue(registry.isAuthorized("myproject", token));

        vm.expectEmit(true, true, true, false);
        emit TokenRevoked(StringUtils.nameHash("myproject"), token, founder);
        registry.revokeToken("myproject", token);
        vm.stopPrank();

        assertFalse(registry.isAuthorized("myproject", token));
    }

    function test_revokeToken_notAuthorized_reverts() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.TokenNotAuthorized.selector, token));
        registry.revokeToken("myproject", token);
    }

    // ─── Reporting Tests ──────────────────────────────────────────────────────

    function test_reportUnauthorizedToken() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(alice);
        vm.expectEmit(true, false, true, false);
        emit UnauthorizedTokenReported(
            StringUtils.nameHash("myproject"),
            "myproject",
            token,
            alice
        );
        registry.reportUnauthorizedToken("myproject", token);

        assertEq(registry.reporterScore(alice), 1);
    }

    function test_reportAuthorizedToken_reverts() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(founder);
        registry.authorizeToken("myproject", token);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.TokenIsAuthorized.selector, token));
        registry.reportUnauthorizedToken("myproject", token);
    }

    function test_reportUnauthorizedToken_duplicateReporter_reverts() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(alice);
        registry.reportUnauthorizedToken("myproject", token);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.DuplicateUnauthorizedReport.selector, alice, token));
        registry.reportUnauthorizedToken("myproject", token);
    }

    function test_authorizeExternalAsset_byFounder() public {
        _registerProject("myproject");

        bytes32 assetKey = keccak256(
            abi.encodePacked("tethics:asset:", "solana", ":", "mint", ":", "So11111111111111111111111111111111111111112")
        );

        vm.prank(founder);
        vm.expectEmit(true, true, true, true);
        emit ExternalAssetAuthorized(
            StringUtils.nameHash("myproject"),
            assetKey,
            "myproject",
            "solana",
            "mint",
            "So11111111111111111111111111111111111111112",
            founder,
            "ipfs://mint-proof"
        );
        registry.authorizeExternalAsset(
            "myproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112",
            "ipfs://mint-proof"
        );

        IRegistry.ExternalAssetView memory asset = registry.getExternalAsset(
            "myproject",
            "solana",
            "mint",
            "So11111111111111111111111111111111111111112"
        );
        assertTrue(asset.exists);
        assertTrue(asset.authorized);
        assertEq(asset.updatedBy, founder);
    }

    function test_authorizeExternalAsset_byApprover_forCuratedProject() public {
        address approver = makeAddr("approver");
        registry.addApprover(approver);

        vm.prank(approver);
        registry.authorizeExternalAsset(
            "solproject",
            "SOLANA",
            "BAGS_CREATOR",
            "bags-creator-wallet",
            "ipfs://bags-creator"
        );

        IRegistry.ExternalAssetView memory asset = registry.getExternalAsset(
            "solproject",
            "SOLANA",
            "BAGS_CREATOR",
            "bags-creator-wallet"
        );
        assertTrue(asset.exists);
        assertTrue(asset.authorized);
        assertEq(asset.updatedBy, approver);
    }

    function test_authorizeExternalAsset_nonManager_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IRegistry.NotExternalAssetManager.selector, alice));
        registry.authorizeExternalAsset(
            "solproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112",
            "ipfs://mint-proof"
        );
    }

    function test_authorizeExternalAsset_requiresMetadataURI() public {
        _registerProject("myproject");

        vm.prank(founder);
        vm.expectRevert(IRegistry.MissingMetadataURI.selector);
        registry.authorizeExternalAsset(
            "myproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112",
            " "
        );
    }

    function test_revokeExternalAsset() public {
        _registerProject("myproject");

        vm.prank(founder);
        registry.authorizeExternalAsset(
            "myproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112",
            "ipfs://mint-proof"
        );

        bytes32 assetKey = keccak256(
            abi.encodePacked("tethics:asset:", "solana", ":", "mint", ":", "So11111111111111111111111111111111111111112")
        );

        vm.prank(founder);
        vm.expectEmit(true, true, true, true);
        emit ExternalAssetRevoked(
            StringUtils.nameHash("myproject"),
            assetKey,
            "myproject",
            "solana",
            "mint",
            "So11111111111111111111111111111111111111112",
            founder,
            "ipfs://revoked"
        );
        registry.revokeExternalAsset(
            "myproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112",
            "ipfs://revoked"
        );

        IRegistry.ExternalAssetView memory asset = registry.getExternalAsset(
            "myproject",
            "SOLANA",
            "MINT",
            "So11111111111111111111111111111111111111112"
        );
        assertTrue(asset.exists);
        assertFalse(asset.authorized);
    }

    // ─── Shield Linking Tests ─────────────────────────────────────────────────

    function test_linkShield_onlyFactory() public {
        _registerProject("myproject");
        address shield = makeAddr("shield");

        vm.prank(alice);
        vm.expectRevert(IRegistry.OnlyShieldFactory.selector);
        registry.linkShield("myproject", shield);
    }

    function test_linkShield_success() public {
        _registerProject("myproject");
        address shield = makeAddr("shield");

        vm.prank(factory);
        vm.expectEmit(true, true, false, false);
        emit ShieldLinked(StringUtils.nameHash("myproject"), shield);
        registry.linkShield("myproject", shield);

        IRegistry.ProjectView memory info = registry.getProjectInfo("myproject");
        assertEq(info.shieldContract, shield);
    }

    function test_linkShield_cannotLinkTwice() public {
        _registerProject("myproject");
        address shield = makeAddr("shield");
        address shield2 = makeAddr("shield2");

        vm.prank(factory);
        registry.linkShield("myproject", shield);

        vm.prank(factory);
        vm.expectRevert(IRegistry.ShieldAlreadyLinked.selector);
        registry.linkShield("myproject", shield2);
    }

    function test_linkShield_zeroAddress_reverts() public {
        _registerProject("myproject");

        vm.prank(factory);
        vm.expectRevert(IRegistry.InvalidShieldContract.selector);
        registry.linkShield("myproject", address(0));
    }

    // ─── isAuthorized edge cases ──────────────────────────────────────────────

    function test_isAuthorized_unregisteredProject_returnsFalse() public view {
        assertFalse(registry.isAuthorized("nonexistent", address(0x1)));
    }

    function test_isAuthorized_byHash() public {
        _registerProject("myproject");
        address token = makeAddr("token");

        vm.prank(founder);
        registry.authorizeToken("myproject", token);

        bytes32 h = StringUtils.nameHash("myproject");
        assertTrue(registry.isAuthorizedByHash(h, token));
    }
}
