// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract TransparentUpgradeableProxy {
    bytes32 private constant IMPLEMENTATION_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1);
    bytes32 private constant ADMIN_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    constructor(address implementation_, address admin_, bytes memory data) payable {
        require(implementation_ != address(0), "Proxy: zero implementation");
        require(implementation_.code.length > 0, "Proxy: implementation has no code");
        require(admin_ != address(0), "Proxy: zero admin");
        _setAdmin(admin_);
        _setImplementation(implementation_);

        if (data.length > 0) {
            (bool ok, bytes memory reason) = implementation_.delegatecall(data);
            require(ok, string(reason));
        }
    }

    modifier ifAdmin() {
        if (msg.sender == _admin()) {
            _;
        } else {
            _fallback();
        }
    }

    function admin() external ifAdmin returns (address) {
        return _admin();
    }

    function implementation() external ifAdmin returns (address) {
        return _implementation();
    }

    function changeAdmin(address newAdmin) external ifAdmin {
        require(newAdmin != address(0), "Proxy: zero admin");
        _setAdmin(newAdmin);
    }

    function upgradeTo(address newImplementation) external ifAdmin {
        require(newImplementation != address(0), "Proxy: zero implementation");
        require(newImplementation.code.length > 0, "Proxy: implementation has no code");
        _setImplementation(newImplementation);
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable ifAdmin {
        require(newImplementation != address(0), "Proxy: zero implementation");
        require(newImplementation.code.length > 0, "Proxy: implementation has no code");
        _setImplementation(newImplementation);
        (bool ok, bytes memory reason) = newImplementation.delegatecall(data);
        require(ok, string(reason));
    }

    fallback() external payable {
        _fallback();
    }

    receive() external payable {
        _fallback();
    }

    function _implementation() internal view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }

    function _admin() internal view returns (address adm) {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            adm := sload(slot)
        }
    }

    function _setImplementation(address newImplementation) internal {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    function _setAdmin(address newAdmin) internal {
        bytes32 slot = ADMIN_SLOT;
        assembly {
            sstore(slot, newAdmin)
        }
    }

    function _fallback() internal {
        require(msg.sender != _admin(), "Proxy admin cannot fallback");
        _delegate(_implementation());
    }

    function _delegate(address implementation_) internal {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), implementation_, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
