// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";
import {ShieldFactory} from "../src/ShieldFactory.sol";

/// @title Deploy
/// @notice Deployment script for Base Sepolia (testnet) and Base Mainnet.
///         Deploys Registry + ShieldFactory atomically.
///
/// Usage (testnet):
///   forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
///
/// Usage (mainnet):
///   forge script script/Deploy.s.sol --rpc-url $BASE_RPC --broadcast --verify
///
/// Environment variables required:
///   PRIVATE_KEY       - deployer private key (hex, no 0x prefix)
///   ETHERSCAN_API_KEY - for contract verification (optional)
///   SWAP_ROUTER       - Uniswap V3 router address on target chain
///   WETH_ADDRESS      - WETH address on target chain
contract Deploy is Script {
    // ─── Base Mainnet Addresses ───────────────────────────────────────────────
    address constant BASE_UNISWAP_V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant BASE_WETH = 0x4200000000000000000000000000000000000006;

    // ─── Base Sepolia Addresses ───────────────────────────────────────────────
    address constant BASE_SEPOLIA_UNISWAP_V3_ROUTER = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        // Pick DEX addresses from env or use defaults
        address swapRouter = vm.envOr("SWAP_ROUTER", BASE_SEPOLIA_UNISWAP_V3_ROUTER);
        address wethAddr = vm.envOr("WETH_ADDRESS", BASE_SEPOLIA_WETH);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Swap Router:", swapRouter);
        console.log("WETH:", wethAddr);

        vm.startBroadcast(deployerKey);

        // ── Step 1: Deploy Registry with placeholder factory ──
        // We'll update registry's factory reference via a pre-computed address trick.
        // Since Registry.shieldFactory is immutable, we need to know the factory address
        // before deploying Registry.
        //
        // Solution: use a nonce-based pre-computation.
        // Deployer nonce N   → Registry
        // Deployer nonce N+1 → ShieldFactory
        //
        // Pre-compute ShieldFactory address at nonce N+1
        uint256 nonce = vm.getNonce(deployer);
        address predictedFactory = _computeAddress(deployer, nonce + 1);

        console.log("Predicted ShieldFactory address:", predictedFactory);

        // Deploy Registry pointing to predicted factory
        Registry registry = new Registry(predictedFactory);
        console.log("Registry deployed at:", address(registry));

        // Deploy ShieldFactory pointing back to registry
        ShieldFactory shieldFactory = new ShieldFactory(address(registry), swapRouter, wethAddr);
        console.log("ShieldFactory deployed at:", address(shieldFactory));

        // Verify addresses match prediction
        require(address(shieldFactory) == predictedFactory, "Factory address mismatch!");
        console.log("Address prediction verified.");

        vm.stopBroadcast();

        // ── Summary ──
        console.log("\n=== DEPLOYMENT COMPLETE ===");
        console.log("Registry:     ", address(registry));
        console.log("ShieldFactory:", address(shieldFactory));
        console.log("Chain ID:     ", block.chainid);
    }

    /// @notice Compute the address of the Nth contract deployed by `deployer`
    function _computeAddress(address deployer, uint256 nonce) internal pure returns (address) {
        // RLP encoding of (deployer, nonce) for CREATE opcode
        if (nonce == 0) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(0x80)))))
            );
        } else if (nonce <= 0x7f) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(uint8(nonce))))))
            );
        } else {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes2(0xd794), deployer, bytes1(0x81), bytes1(uint8(nonce))))))
            );
        }
    }
}
