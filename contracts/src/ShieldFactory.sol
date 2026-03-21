// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Shield} from "./Shield.sol";
import {IRegistry} from "./interfaces/IRegistry.sol";
import {StringUtils} from "./libraries/StringUtils.sol";

/// @title ShieldFactory
/// @notice Deploys deterministic per-founder Shield contracts via CREATE2.
///         The Shield address is computable from (founder, projectName) before deployment.
/// @dev    Links each deployed Shield back to the Registry automatically.
contract ShieldFactory {
    using StringUtils for string;

    // ─── Immutables ───────────────────────────────────────────────────────────

    /// @notice The Registry contract this factory links to
    address public immutable registry;

    /// @notice Default swap router (Uniswap V3 on Base)
    address public immutable defaultSwapRouter;

    /// @notice Default WETH address (for swap output)
    address public immutable defaultWeth;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ShieldDeployed(
        string indexed projectName,
        address indexed founder,
        address indexed shieldAddress,
        address charityAddress
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvalidCharity();
    error InvalidRouter();
    error InvalidWrappedNative();
    error DeploymentFailed();
    error ProjectNotRegistered();
    error NotFounder(address caller, address founder);
    error InactiveCharityOption(uint256 charityId);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _registry Registry contract address
    /// @param _swapRouter Default Uniswap V3 / Aerodrome router
    /// @param _weth WETH address on this chain
    constructor(address _registry, address _swapRouter, address _weth) {
        registry = _registry;
        defaultSwapRouter = _swapRouter;
        defaultWeth = _weth;
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    /// @notice Deploy a Shield for a registered project
    /// @param projectName The project name (must already be registered in Registry)
    /// @param charityId Approved charity option id selected by the founder
    /// @return shield Address of the newly deployed Shield contract
    function deployShield(string calldata projectName, uint256 charityId)
        external
        returns (address shield)
    {
        return deployShieldWithRouter(projectName, charityId, defaultSwapRouter, defaultWeth);
    }

    /// @notice Deploy a Shield with a custom swap router (for non-default DEX)
    /// @param projectName The project name (must already be registered in Registry)
    /// @param charityId Approved charity option id
    /// @param swapRouter Custom DEX router address
    /// @param weth WETH / output token address
    /// @return shield Address of the newly deployed Shield contract
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

        // Only the registered founder may deploy their Shield
        address founder = IRegistry(registry).getFounder(projectName);
        if (founder == address(0)) revert ProjectNotRegistered();
        if (msg.sender != founder) revert NotFounder(msg.sender, founder);

        string memory normalized = StringUtils.normalize(projectName);

        // Compute CREATE2 salt from founder + normalized name
        bytes32 salt = keccak256(abi.encodePacked(founder, keccak256(bytes(normalized))));

        // Deploy Shield via CREATE2
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

        // Link Shield back to Registry
        IRegistry(registry).linkShield(projectName, shield);

        emit ShieldDeployed(normalized, founder, shield, charityAddress);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Predict the Shield address for a given founder + project name + charity selection (before deployment)
    /// @param founder Founder address
    /// @param projectName Normalized project name
    /// @param charityId Approved charity option id used at deployment time
    /// @return predicted Predicted Shield contract address
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
