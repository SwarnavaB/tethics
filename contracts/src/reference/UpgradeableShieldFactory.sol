// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Shield} from "../Shield.sol";
import {IRegistry} from "../interfaces/IRegistry.sol";
import {StringUtils} from "../libraries/StringUtils.sol";
import {Initializable} from "./Initializable.sol";

/// @title UpgradeableShieldFactory
/// @notice Upgradeable reference implementation for deterministic Shield deployment.
/// @dev Individual Shield instances remain immutable. The factory itself is proxy-friendly.
contract UpgradeableShieldFactory is Initializable {
    using StringUtils for string;

    address public registry;
    address public defaultSwapRouter;
    address public defaultWeth;
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event FactoryConfigUpdated(address indexed swapRouter, address indexed weth);
    event RegistryUpdated(address indexed previousRegistry, address indexed newRegistry);
    event ShieldDeployed(
        string indexed projectName,
        address indexed founder,
        address indexed shieldAddress,
        address charityAddress
    );

    error NotOwner();
    error InvalidRegistry();
    error InvalidCharity();
    error InvalidRouter();
    error InvalidWrappedNative();
    error DeploymentFailed();
    error ProjectNotRegistered();
    error NotFounder(address caller, address founder);
    error InactiveCharityOption(uint256 charityId);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address registry_,
        address swapRouter_,
        address weth_
    ) external initializer {
        if (initialOwner == address(0)) revert NotOwner();
        if (registry_ == address(0)) revert InvalidRegistry();
        if (swapRouter_ == address(0)) revert InvalidRouter();
        if (weth_ == address(0)) revert InvalidWrappedNative();

        owner = initialOwner;
        registry = registry_;
        defaultSwapRouter = swapRouter_;
        defaultWeth = weth_;

        emit OwnershipTransferred(address(0), initialOwner);
        emit RegistryUpdated(address(0), registry_);
        emit FactoryConfigUpdated(swapRouter_, weth_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NotOwner();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setRegistry(address newRegistry) external onlyOwner {
        if (newRegistry == address(0)) revert InvalidRegistry();
        emit RegistryUpdated(registry, newRegistry);
        registry = newRegistry;
    }

    function setFactoryConfig(address swapRouter_, address weth_) external onlyOwner {
        if (swapRouter_ == address(0)) revert InvalidRouter();
        if (weth_ == address(0)) revert InvalidWrappedNative();
        defaultSwapRouter = swapRouter_;
        defaultWeth = weth_;
        emit FactoryConfigUpdated(swapRouter_, weth_);
    }

    function deployShield(string calldata projectName, uint256 charityId)
        external
        returns (address shield)
    {
        return deployShieldWithRouter(projectName, charityId, defaultSwapRouter, defaultWeth);
    }

    function deployShieldWithRouter(
        string calldata projectName,
        uint256 charityId,
        address swapRouter,
        address weth
    ) public returns (address shield) {
        if (swapRouter == address(0)) revert InvalidRouter();
        if (weth == address(0)) revert InvalidWrappedNative();

        IRegistry.CharityOptionView memory charityOption = IRegistry(registry).getCharityOption(charityId);
        if (!charityOption.exists || !charityOption.active) revert InactiveCharityOption(charityId);
        address charityAddress = charityOption.payoutAddress;
        if (charityAddress == address(0)) revert InvalidCharity();

        address founder = IRegistry(registry).getFounder(projectName);
        if (founder == address(0)) revert ProjectNotRegistered();
        if (msg.sender != founder) revert NotFounder(msg.sender, founder);

        string memory normalized = StringUtils.normalize(projectName);
        bytes32 salt = keccak256(abi.encodePacked(founder, keccak256(bytes(normalized))));
        bytes memory bytecode = _buildShieldCreationCode(
            normalized,
            charityAddress,
            founder,
            swapRouter,
            weth
        );

        assembly {
            shield := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        if (shield == address(0)) revert DeploymentFailed();

        IRegistry(registry).linkShield(projectName, shield);
        emit ShieldDeployed(normalized, founder, shield, charityAddress);
    }

    function predictShieldAddress(address founder, string calldata projectName, uint256 charityId)
        external
        view
        returns (address predicted)
    {
        IRegistry.CharityOptionView memory charityOption = IRegistry(registry).getCharityOption(charityId);
        if (!charityOption.exists || !charityOption.active) revert InactiveCharityOption(charityId);
        address charityAddress = charityOption.payoutAddress;
        if (charityAddress == address(0)) revert InvalidCharity();
        string memory normalized = StringUtils.normalize(projectName);
        bytes32 salt = keccak256(abi.encodePacked(founder, keccak256(bytes(normalized))));
        bytes32 initCodeHash = keccak256(_buildShieldCreationCode(
            normalized,
            charityAddress,
            founder,
            defaultSwapRouter,
            defaultWeth
        ));

        predicted = address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash))
                )
            )
        );
    }

    function _buildShieldCreationCode(
        string memory normalized,
        address charityAddress,
        address founder,
        address swapRouter,
        address weth
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(Shield).creationCode,
            abi.encode(normalized, charityAddress, registry, founder, swapRouter, weth)
        );
    }
}
