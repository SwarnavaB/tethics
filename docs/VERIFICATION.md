# Verification: How Proof Validation Works

tethics requires a founder to submit at least **2 proofs from different categories** when registering a project. This section explains each proof type, how it's validated, and what it proves.

---

## Proof Types

### 1. Deployer Wallet Signature (`PROOF_DEPLOYER_SIG`)

**What it proves:** The registrant controls the wallet that deployed the project's smart contracts.

**How it works:**

The founder signs a deterministic commitment message from their deployer wallet:

```
commitment = keccak256("tethics:register:" + projectName + ":" + founderAddress)
signedMessage = EIP-191 personal sign of commitment
```

The signature is verified onchain using `ecrecover`. The recovered address must match the `deployer` address in the proof data.

**Proof data format:**
```solidity
bytes data = abi.encode(address deployer, bytes signature);
```

**Limitations:** Does NOT automatically verify that `deployer` actually deployed any contracts. This is left to off-chain verification (Etherscan, block explorers). The onchain part proves private key control only.

**How to generate:**

Using viem:
```typescript
const commitment = keccak256(
  encodePacked(
    ['string', 'string', 'string', 'address'],
    ['tethics:register:', projectName, ':', founderAddress]
  )
);
const signature = await walletClient.signMessage({ message: { raw: commitment } });
```

---

### 2. ENS Resolution (`PROOF_ENS`)

**What it proves:** The registrant claims to control an ENS name.

**How it works:**

The founder specifies an ENS name (e.g., `myproject.eth`). The Registry stores the claim hash:
```
claim = keccak256(abi.encodePacked(ensName, founderAddress))
```

**Onchain validation:** On Base L2, full ENS resolution isn't natively available. The claim is stored as an off-chain anchor. Off-chain tools verify that the ENS name's ETH record resolves to the founder's address.

**Proof data format:**
```solidity
bytes data = abi.encode(string ensName);
```

**Verification:** Check ENS: `https://app.ens.domains/yourname.eth` → ETH address should match founder.

---

### 3. DNS TXT Record (`PROOF_DNS_TXT`)

**What it proves:** The registrant controls a domain.

**How it works:**

The founder adds a TXT record to their domain:
```
tethics=<founderAddress>
```

Then submits the (domain, address) pair as proof. The hash is stored onchain:
```
hash = keccak256(abi.encodePacked(domain, founderAddress))
```

**Proof data format:**
```solidity
bytes data = abi.encode(string domain, address founder);
```

**Verification:** Run:
```bash
dig TXT yourdomain.com | grep tokenshield
```

The address in the TXT record should match the founder's registered address.

---

### 4. GitHub Attestation (`PROOF_GITHUB`)

**What it proves:** The registrant controls a GitHub account.

**How it works:**

The founder creates a public GitHub Gist or commit containing:
```
tethics:register:<projectName>:<founderAddress>
```

The hash of this attestation is stored onchain. Off-chain tools can verify the GitHub account is the official project account.

**Proof data format:**
```solidity
bytes data = abi.encode(string githubUsername, string attestationUrl, bytes32 contentHash);
```

**Future enhancement:** Integration with Ethereum Attestation Service (EAS) would make this more formal.

---

### 5. Existing Contract Ownership (`PROOF_CONTRACT_OWNER`)

**What it proves:** The registrant controls an address that deployed existing project contracts.

**How it works:**

The founder claims ownership of a deployer address by submitting the address and proof data. The hash is stored onchain.

**Proof data format:**
```solidity
bytes data = abi.encode(address deployerAddress, string[] contractAddresses);
```

**Verification:** Check that `deployerAddress` is the deployer of the listed contracts via Etherscan or block explorer.

---

## Two-Proof Requirement

The contract enforces:
1. **Minimum 2 proofs:** `if (proofs.length < 2) revert InsufficientProofs()`
2. **Different categories:** `if (usedCategories[pt]) revert DuplicateProofCategory()`

**Rationale:** Two independent proofs from different systems make impersonation much harder. An attacker would need to simultaneously compromise:
- A private key (for DEPLOYER_SIG), AND
- A domain/ENS/GitHub account (for any second proof)

These are operated by different systems and have different attack vectors.

---

## Proof Hash Storage

All proof data is stored as `bytes32 hashes` in the Registry, not as raw data:

```solidity
proofHashes[i] = keccak256(abi.encode(pt, proofs[i].data, founder, block.chainid));
```

This includes `block.chainid` to prevent cross-chain replay of proofs.

---

## Off-Chain Verification

The static frontend and community tools can verify proofs off-chain:

1. **Fetch** `getProjectInfo(name)` → `verificationProofs[]` array
2. **Re-derive** the expected hash for each proof type from the claim data
3. **Compare** with stored hash
4. **Verify** the off-chain component (ENS lookup, DNS query, GitHub API)

The [Watcher CLI](../watcher/) includes verification logic for automated checks.

---

## Challenge Mechanism

After registration, a **48-hour challenge window** is open. During this window:

```solidity
function disputeRegistration(
    string calldata name,
    string calldata reason,
    VerificationLib.Proof[] calldata proofs
) external
```

If a challenger provides **more proofs** than the original registration, the registration is transferred. This protects against:
- Name squatting by non-project-owners
- Rushed registrations with weak proofs

After 48 hours, the challenge window closes and the registration is final.

**Note:** v1 uses a simple "more proofs wins" mechanism. Future versions may integrate a more sophisticated dispute resolution (e.g., Kleros arbitration or EAS-based adjudication).
