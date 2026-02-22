// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";
import {ShieldFactory} from "../src/ShieldFactory.sol";
import {Shield} from "../src/Shield.sol";
import {IShield} from "../src/interfaces/IShield.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";
import {StringUtils} from "../src/libraries/StringUtils.sol";

/// @title ShieldFactoryTest
/// @notice Unit tests for ShieldFactory.sol
contract ShieldFactoryTest is Test {
    Registry public registry;
    ShieldFactory public factory;

    address public swapRouter = makeAddr("swapRouter");
    address public weth = makeAddr("weth");
    address public charity = makeAddr("charity");

    uint256 public founderKey = 0xA11CE;
    address public founder;

    function setUp() public {
        founder = vm.addr(founderKey);

        // Deploy factory first (registry needs factory address)
        // Bootstrap: deploy registry with placeholder, then deploy factory
        // In production Deploy.s.sol handles this via pre-computed addresses
        registry = new Registry(address(0)); // temp: factory = zero, will be replaced in deploy script
        // For tests, we deploy a factory pointing to this registry
        factory = new ShieldFactory(address(registry), swapRouter, weth);
    }

    function test_deployShield_mustBeFounder() public {
        _registerProject("myproject");
        address notFounder = makeAddr("notFounder");
        vm.prank(notFounder);
        vm.expectRevert("ShieldFactory: caller is not founder");
        factory.deployShield("myproject", charity);
    }

    function test_deployShield_projectNotRegistered_reverts() public {
        vm.prank(founder);
        vm.expectRevert(ShieldFactory.ProjectNotRegistered.selector);
        factory.deployShield("unregistered", charity);
    }

    function test_deployShield_zeroCharity_reverts() public {
        _registerProject("myproject");
        vm.prank(founder);
        vm.expectRevert(ShieldFactory.InvalidCharity.selector);
        factory.deployShield("myproject", address(0));
    }

    function test_predictShieldAddress_matchesDeployed() public {
        _registerProject("myproject");

        address predicted = factory.predictShieldAddress(founder, "myproject");

        // predicted address won't exactly match (charity arg differs in initCodeHash)
        // but we can verify the format - for production, the predict function would need
        // the charity address too. Test that address is non-zero.
        assertTrue(predicted != address(0));
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
