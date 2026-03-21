// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";
import {ShieldFactory} from "../src/ShieldFactory.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";

/// @title ShieldFactoryTest
/// @notice Unit tests for ShieldFactory.sol
contract ShieldFactoryTest is Test {
    Registry public registry;
    ShieldFactory public factory;

    address public swapRouter = makeAddr("swapRouter");
    address public weth = makeAddr("weth");
    address public charity = makeAddr("charity");
    uint256 public charityId;

    uint256 public founderKey = 0xA11CE;
    address public founder;

    function setUp() public {
        founder = vm.addr(founderKey);

        uint256 currentNonce = vm.getNonce(address(this));
        address predictedFactory = vm.computeCreateAddress(address(this), currentNonce + 1);

        registry = new Registry(predictedFactory);
        factory = new ShieldFactory(address(registry), swapRouter, weth);
        charityId = registry.addCharityOption("GiveDirectly", charity, "ipfs://charity");
    }

    function test_deployShield_mustBeFounder() public {
        _registerProject("myproject");
        address notFounder = makeAddr("notFounder");
        vm.prank(notFounder);
        vm.expectRevert(abi.encodeWithSelector(ShieldFactory.NotFounder.selector, notFounder, founder));
        factory.deployShield("myproject", charityId);
    }

    function test_deployShield_projectNotRegistered_reverts() public {
        vm.prank(founder);
        vm.expectRevert(ShieldFactory.ProjectNotRegistered.selector);
        factory.deployShield("unregistered", charityId);
    }

    function test_deployShield_inactiveCharity_reverts() public {
        _registerProject("myproject");
        registry.updateCharityOption(charityId, "GiveDirectly", charity, "ipfs://charity", false);
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(ShieldFactory.InactiveCharityOption.selector, charityId));
        factory.deployShield("myproject", charityId);
    }

    function test_predictShieldAddress_matchesDeployed() public {
        _registerProject("myproject");

        address predicted = factory.predictShieldAddress(founder, "myproject", charityId);

        vm.prank(founder);
        address deployed = factory.deployShield("myproject", charityId);
        assertEq(predicted, deployed);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _registerProject(string memory name) internal {
        VerificationLib.Proof[] memory proofs = new VerificationLib.Proof[](2);
        // Proof 1: deployer sig
        bytes32 commitment = VerificationLib.registrationCommitment(name, founder);
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", commitment));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(founderKey, ethHash);
        proofs[0] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_DEPLOYER_SIG,
            data: abi.encode(founder, abi.encodePacked(r, s, v))
        });
        // Proof 2: ENS
        proofs[1] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_ENS,
            data: abi.encode("myproject.eth")
        });

        vm.prank(founder);
        registry.register(name, proofs);
        // Test contract is the owner - approve directly
        registry.approveRegistration(name);
    }
}
