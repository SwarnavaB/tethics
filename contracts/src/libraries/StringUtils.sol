// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StringUtils
/// @notice Utility functions for string normalization and comparison
library StringUtils {
    /// @notice Normalize a project name: lowercase + trim whitespace
    /// @param input Raw project name
    /// @return normalized Lowercased, trimmed name
    function normalize(string memory input) internal pure returns (string memory normalized) {
        bytes memory b = bytes(input);
        uint256 start = 0;
        uint256 end = b.length;

        // Trim leading whitespace
        while (start < end && b[start] == 0x20) {
            start++;
        }
        // Trim trailing whitespace
        while (end > start && b[end - 1] == 0x20) {
            end--;
        }

        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            bytes1 c = b[i];
            // Lowercase A-Z (0x41-0x5A) → a-z (0x61-0x7A)
            if (c >= 0x41 && c <= 0x5A) {
                result[i - start] = bytes1(uint8(c) + 32);
            } else {
                result[i - start] = c;
            }
        }
        return string(result);
    }

    /// @notice Compute keccak256 of a normalized project name
    /// @param name Raw project name
    /// @return Hash of the normalized name
    function nameHash(string memory name) internal pure returns (bytes32) {
        return keccak256(bytes(normalize(name)));
    }

    /// @notice Check if a string is non-empty after normalization
    /// @param name Raw project name
    /// @return True if non-empty
    function isNonEmpty(string memory name) internal pure returns (bool) {
        return bytes(normalize(name)).length > 0;
    }

    /// @notice Validate project name: alphanumeric + hyphens/underscores, 2–64 chars
    /// @param name Normalized project name
    /// @return valid True if valid
    function isValidName(string memory name) internal pure returns (bool valid) {
        string memory n = normalize(name);
        bytes memory b = bytes(n);
        uint256 len = b.length;
        if (len < 2 || len > 64) return false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isAlphaNum = (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39);
            bool isSpecial = c == 0x2D || c == 0x5F; // '-' or '_'
            if (!isAlphaNum && !isSpecial) return false;
        }
        return true;
    }
}
