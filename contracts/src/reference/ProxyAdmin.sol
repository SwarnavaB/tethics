// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITransparentUpgradeableProxy {
    function admin() external returns (address);
    function implementation() external returns (address);
    function changeAdmin(address newAdmin) external;
    function upgradeTo(address newImplementation) external;
    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable;
}

contract ProxyAdmin {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "ProxyAdmin: not owner");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "ProxyAdmin: zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ProxyAdmin: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function getProxyAdmin(address proxy) external onlyOwner returns (address) {
        return ITransparentUpgradeableProxy(proxy).admin();
    }

    function getProxyImplementation(address proxy) external onlyOwner returns (address) {
        return ITransparentUpgradeableProxy(proxy).implementation();
    }

    function changeProxyAdmin(address proxy, address newAdmin) external onlyOwner {
        ITransparentUpgradeableProxy(proxy).changeAdmin(newAdmin);
    }

    function upgrade(address proxy, address newImplementation) external onlyOwner {
        ITransparentUpgradeableProxy(proxy).upgradeTo(newImplementation);
    }

    function upgradeAndCall(address proxy, address newImplementation, bytes calldata data) external payable onlyOwner {
        ITransparentUpgradeableProxy(proxy).upgradeToAndCall{value: msg.value}(newImplementation, data);
    }
}
