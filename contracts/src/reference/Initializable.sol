// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Initializable {
    bool private _initialized;
    bool private _initializing;

    modifier initializer() {
        require(!_initialized || _initializing, "Initializable: already initialized");
        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }
        _;
        if (isTopLevelCall) {
            _initializing = false;
        }
    }

    function _disableInitializers() internal {
        require(!_initializing, "Initializable: initializing");
        _initialized = true;
    }
}
