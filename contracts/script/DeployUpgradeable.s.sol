// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {UpgradeableRegistry} from "../src/reference/UpgradeableRegistry.sol";
import {UpgradeableShieldFactory} from "../src/reference/UpgradeableShieldFactory.sol";
import {ProxyAdmin} from "../src/reference/ProxyAdmin.sol";
import {TransparentUpgradeableProxy} from "../src/reference/TransparentUpgradeableProxy.sol";

/// @title DeployUpgradeable
/// @notice Reference deployment script for proxy-based tethics core contracts.
/// @dev The registry and factory are deployed behind transparent proxies. Individual
///      Shield instances remain immutable even in the upgradeable architecture.
contract DeployUpgradeable is Script {
    address constant BASE_SEPOLIA_UNISWAP_V3_ROUTER = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;
    address constant BASE_SEPOLIA_WETH = 0x4200000000000000000000000000000000000006;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address swapRouter = vm.envOr("SWAP_ROUTER", BASE_SEPOLIA_UNISWAP_V3_ROUTER);
        address wethAddr = vm.envOr("WETH_ADDRESS", BASE_SEPOLIA_WETH);

        vm.startBroadcast(deployerKey);

        ProxyAdmin proxyAdmin = new ProxyAdmin(deployer);

        UpgradeableRegistry registryImpl = new UpgradeableRegistry();
        UpgradeableShieldFactory factoryImpl = new UpgradeableShieldFactory();

        TransparentUpgradeableProxy registryProxy = new TransparentUpgradeableProxy(
            address(registryImpl),
            address(proxyAdmin),
            abi.encodeCall(UpgradeableRegistry.initialize, (deployer, address(0)))
        );

        TransparentUpgradeableProxy factoryProxy = new TransparentUpgradeableProxy(
            address(factoryImpl),
            address(proxyAdmin),
            abi.encodeCall(
                UpgradeableShieldFactory.initialize,
                (deployer, address(registryProxy), swapRouter, wethAddr)
            )
        );

        UpgradeableRegistry(address(registryProxy)).setShieldFactory(address(factoryProxy));

        vm.stopBroadcast();

        console.log("ProxyAdmin:        ", address(proxyAdmin));
        console.log("Registry Impl:     ", address(registryImpl));
        console.log("ShieldFactory Impl:", address(factoryImpl));
        console.log("Registry Proxy:    ", address(registryProxy));
        console.log("ShieldFactory Proxy:", address(factoryProxy));
    }
}
