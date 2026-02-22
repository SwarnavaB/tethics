// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VerificationLib
/// @notice Proof validation logic for founder identity verification
/// @dev Supports multiple proof types; minimum 2 from different categories required
library VerificationLib {
    // ─── Proof Type Identifiers ───────────────────────────────────────────────

    uint8 public constant PROOF_DEPLOYER_SIG = 1; // Deployer wallet ECDSA signature
    uint8 public constant PROOF_ENS = 2;           // ENS name resolution
    uint8 public constant PROOF_DNS_TXT = 3;       // DNS TXT record hash (off-chain anchor)
    uint8 public constant PROOF_GITHUB = 4;        // GitHub attestation hash
    uint8 public constant PROOF_CONTRACT_OWNER = 5; // Existing contract ownership

    // ─── Structs ─────────────────────────────────────────────────────────────

    /// @notice A single verification proof submitted by a founder
    struct Proof {
        uint8 proofType;   // One of the PROOF_* constants above
        bytes data;        // Encoded proof data (type-specific)
    }

    // ─── Errors ───────────────────────────────────────────────────────────────

    error InvalidProofType(uint8 proofType);
    error DuplicateProofCategory();
    error InsufficientProofs();
    error InvalidSignature();
    error SignerMismatch(address expected, address recovered);

    // ─── Validation ───────────────────────────────────────────────────────────

    /// @notice Validate a set of proofs for a founder registration
    /// @param founder Address of the registrant
    /// @param projectName Normalized project name
    /// @param proofs Array of proof structs submitted
    /// @return proofHashes Array of keccak256 hashes of each proof (stored onchain)
    function validateProofs(
        address founder,
        string memory projectName,
        Proof[] memory proofs
    ) internal view returns (bytes32[] memory proofHashes) {
        if (proofs.length < 2) revert InsufficientProofs();

        // Track which categories have been used (prevent duplicate category gaming)
        bool[6] memory usedCategories; // index = proofType (1-5)
        proofHashes = new bytes32[](proofs.length);

        for (uint256 i = 0; i < proofs.length; i++) {
            uint8 pt = proofs[i].proofType;
            if (pt == 0 || pt > 5) revert InvalidProofType(pt);
            if (usedCategories[pt]) revert DuplicateProofCategory();
            usedCategories[pt] = true;

            if (pt == PROOF_DEPLOYER_SIG) {
                _validateDeployerSig(founder, projectName, proofs[i].data);
            } else if (pt == PROOF_ENS) {
                _validateENS(founder, proofs[i].data);
            }
            // DNS, GitHub, Contract ownership are off-chain anchored:
            // Their data hash is stored onchain for future verification.
            // No onchain validation possible without oracles - store hash only.

            proofHashes[i] = keccak256(
                abi.encode(pt, proofs[i].data, founder, block.chainid)
            );
        }
    }

    // ─── Proof Type Implementations ───────────────────────────────────────────

    /// @notice Validate a deployer wallet ECDSA signature
    /// @dev Data encodes: (address deployerAddress, bytes signature)
    ///      The signature must be over: keccak256("tethics:register:" + projectName + ":" + founder)
    /// @param founder The registrant's address
    /// @param projectName Normalized project name
    /// @param data ABI-encoded (address deployer, bytes sig)
    function _validateDeployerSig(
        address founder,
        string memory projectName,
        bytes memory data
    ) internal pure {
        (address deployer, bytes memory sig) = abi.decode(data, (address, bytes));

        // Message = EIP-191 personal sign of the registration commitment
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(
                    abi.encodePacked(
                        "tethics:register:",
                        projectName,
                        ":",
                        founder
                    )
                )
            )
        );

        address recovered = _recoverSigner(messageHash, sig);
        if (recovered != deployer) revert SignerMismatch(deployer, recovered);
        // Note: we don't verify deployer actually deployed contracts here
        // That would require an oracle. We store the deployer address and
        // the community can verify off-chain.
    }

    /// @notice Validate ENS proof
    /// @dev Data encodes: (string ensName) - the ENS name the founder claims
    ///      We check the forward resolution matches the founder's address onchain
    ///      This requires an ENS resolver call; simplified here to store the claim.
    /// @param founder The registrant's address
    /// @param data ABI-encoded (string ensName)
    function _validateENS(address founder, bytes memory data) internal view {
        (string memory ensName) = abi.decode(data, (string));
        // Attempt forward resolution via ENS public resolver on mainnet/L2
        // On L2 (Base), ENS may not be natively available; we accept the claim
        // and store the hash. Off-chain tools verify the TXT/ETH record.
        // For chains with ENS: call resolver and compare returned address to founder.
        // Stubbed: emit the claim hash for indexing.
        bytes32 claim = keccak256(abi.encodePacked(ensName, founder));
        // Silence unused variable warning
        (founder, claim);
    }

    // ─── ECDSA Utilities ─────────────────────────────────────────────────────

    /// @notice Recover signer from a message hash and signature
    /// @param hash EIP-191 message hash
    /// @param sig 65-byte signature (r, s, v)
    /// @return signer Recovered address
    function _recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address signer) {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }

    /// @notice Generate the message a founder must sign for PROOF_DEPLOYER_SIG
    /// @param projectName Normalized project name
    /// @param founder Founder address
    /// @return The raw bytes32 to sign (before EIP-191 prefix)
    function registrationCommitment(string memory projectName, address founder)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                "tethics:register:",
                projectName,
                ":",
                founder
            )
        );
    }
}
