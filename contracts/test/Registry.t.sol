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

    event ProjectRegistered(bytes32 indexed nameHash, string name, address indexed founder, uint256 challengeDeadline);
    event TokenAuthorized(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);
    event TokenRevoked(bytes32 indexed nameHash, address indexed tokenContract, address indexed founder);
    event UnauthorizedTokenReported(bytes32 indexed nameHash, string name, address indexed tokenContract, address indexed reporter);
    event ShieldLinked(bytes32 indexed nameHash, address indexed shieldContract);

    function setUp() public {
        founder = vm.addr(founderKey);
        registry = new Registry(factory);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    /// @dev Build a deployer-sig proof. NOT pure - calls vm.sign cheatcode.
    function _makeDeployerSigProof(
        address signerAddr,
        uint256 signerKey,
        string memory name,
        address _founder
    ) internal returns (VerificationLib.Proof memory) {
        // Compute the same hash the contract will verify against
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

    // ─── Registration Tests ───────────────────────────────────────────────────

    function test_register_success() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        vm.prank(founder);
        registry.register("myproject", proofs);

        assertTrue(registry.isRegistered("myproject"));
        assertEq(registry.getFounder("myproject"), founder);

        IRegistry.ProjectView memory info = registry.getProjectInfo("myproject");
        assertTrue(info.exists);
        assertEq(info.founder, founder);
        assertGt(info.challengeDeadline, block.timestamp);
    }

    function test_register_emitsEvent() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        bytes32 expectedHash = StringUtils.nameHash("myproject");
        uint256 expectedDeadline = block.timestamp + registry.CHALLENGE_WINDOW();

        vm.prank(founder);
        vm.expectEmit(true, true, false, false); // check nameHash and founder topics
        emit ProjectRegistered(expectedHash, "myproject", founder, expectedDeadline);
        registry.register("myproject", proofs);
    }

    function test_register_normalizes_name() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");

        vm.prank(founder);
        registry.register("  MyProject  ", proofs);

        // Both raw and normalized resolve to the same project
        assertTrue(registry.isRegistered("myproject"));
        // isRegistered normalizes its input - so "  MyProject  " normalizes to "myproject" → true
        assertTrue(registry.isRegistered("  MyProject  "));
        assertEq(registry.getFounder("myproject"), registry.getFounder("  MyProject  "));
    }

    function test_register_rejects_duplicate() public {
        VerificationLib.Proof[] memory proofs = _getProofs("myproject");
        vm.prank(founder);
        registry.register("myproject", proofs);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IRegistry.ProjectAlreadyExists.selector,
                StringUtils.nameHash("myproject")
            )
        );
        registry.register("myproject", proofs);
    }

    function test_register_rejects_invalid_name() public {
        VerificationLib.Proof[] memory proofs = _getProofs("ab");

        vm.prank(founder);
        vm.expectRevert(IRegistry.InvalidProjectName.selector);
        registry.register("a", proofs); // too short

        vm.expectRevert(IRegistry.InvalidProjectName.selector);
        registry.register("has spaces", proofs); // spaces not allowed in chars (only ascii alpha/digit/hyphen/underscore)
    }

    function test_register_requires_two_proofs() public {
        VerificationLib.Proof[] memory proofs = new VerificationLib.Proof[](1);
        proofs[0] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);

        vm.prank(founder);
        vm.expectRevert(VerificationLib.InsufficientProofs.selector);
        registry.register("myproject", proofs);
    }

    function test_register_rejects_duplicate_proof_category() public {
        VerificationLib.Proof[] memory proofs = new VerificationLib.Proof[](2);
        proofs[0] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);
        proofs[1] = _makeDeployerSigProof(founder, founderKey, "myproject", founder);

        vm.prank(founder);
        vm.expectRevert(VerificationLib.DuplicateProofCategory.selector);
        registry.register("myproject", proofs);
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

    // ─── Internal Helper ─────────────────────────────────────────────────────

    function _registerProject(string memory name) internal {
        VerificationLib.Proof[] memory proofs = _getProofs(name);
        vm.prank(founder);
        registry.register(name, proofs);
    }
}
