// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ShieldFactory} from "../src/ShieldFactory.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";
import {StringUtils} from "../src/libraries/StringUtils.sol";

/// @title RegisterExample
/// @notice Example script showing how a founder registers their project and deploys a Shield.
///
/// Usage:
///   forge script script/RegisterExample.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC \
///     --broadcast \
///     -e PRIVATE_KEY=<founder-key> \
///     -e PROJECT_NAME=myproject \
///     -e CHARITY_ID=<approved-charity-id> \
///     -e REGISTRY_ADDRESS=<registry-address> \
///     -e FACTORY_ADDRESS=<factory-address>
contract RegisterExample is Script {
    function run() external {
        uint256 founderKey = vm.envUint("PRIVATE_KEY");
        address founder = vm.addr(founderKey);
        string memory projectName = vm.envString("PROJECT_NAME");
        uint256 charityId = vm.envUint("CHARITY_ID");
        address registryAddress = vm.envAddress("REGISTRY_ADDRESS");
        address factoryAddress = vm.envAddress("FACTORY_ADDRESS");

        console.log("Founder:", founder);
        console.log("Project:", projectName);
        console.log("Charity ID:", charityId);

        Registry registry = Registry(registryAddress);
        ShieldFactory factory = ShieldFactory(factoryAddress);

        VerificationLib.Proof[] memory proofs = _buildProofs(founderKey, founder, projectName);

        vm.startBroadcast(founderKey);

        string memory normalized = StringUtils.normalize(projectName);
        console.log("Registering project:", normalized);
        registry.register(projectName, proofs);
        console.log("Registration successful!");

        console.log("Deploying Shield with charity id:", charityId);
        address shield = factory.deployShield(projectName, charityId);
        console.log("Shield deployed at:", shield);

        vm.stopBroadcast();

        console.log("\n=== REGISTRATION COMPLETE ===");
        console.log("Project: ", normalized);
        console.log("Founder: ", founder);
        console.log("Shield:  ", shield);
        console.log("Charity ID:", charityId);
    }

    function _buildProofs(
        uint256 founderKey,
        address founder,
        string memory projectName
    ) internal returns (VerificationLib.Proof[] memory proofs) {
        proofs = new VerificationLib.Proof[](2);

        // Proof 1: Deployer Signature
        string memory normalized = StringUtils.normalize(projectName);
        bytes32 commitment = VerificationLib.registrationCommitment(normalized, founder);
        bytes32 ethHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", commitment)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(founderKey, ethHash);
        proofs[0] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_DEPLOYER_SIG,
            data: abi.encode(founder, abi.encodePacked(r, s, v))
        });

        // Proof 2: DNS TXT Record Hash
        string memory domain = vm.envOr("DOMAIN", string("example.com"));
        proofs[1] = VerificationLib.Proof({
            proofType: VerificationLib.PROOF_DNS_TXT,
            data: abi.encode(domain, founder)
        });
    }
}
