# Threat Model

This document covers attack vectors against tethics and the mitigations in place.

---

## Assumptions

- **Ethereum base layer is secure:** We assume the EVM behaves correctly and validator collusion is not a threat at this scale.
- **Cryptographic primitives are secure:** keccak256 and ECDSA are not broken.
- **The founder is honest:** tethics verifies identity, not intent. A founder who authorizes a rug-pull token is acting honestly (they're authorizing their own scam) but maliciously.

---

## Attack Vectors

### 1. Name Squatting

**Attack:** Register "coinbase" or "uniswap" before the real founder does.

**Mitigations:**
- 48-hour challenge window: the real project can dispute with stronger proofs
- Multi-proof requirement: squatter must fake at least 2 independent proof types
- First-come-first-served with challenge: registering early isn't sufficient if you can't prove identity

**Residual risk:** Projects that don't know about tethics may be slow to claim their name. Awareness is a key mitigation.

---

### 2. Proof Forgery

**Attack:** Generate valid-looking proofs without actually controlling the project.

**For DEPLOYER_SIG:** Requires compromising the project's private key: same attack surface as stealing ETH. Not a tethics-specific vulnerability.

**For DNS/ENS:** Requires DNS hijacking or ENS compromise: standard web security threats, independent of tethics.

**For GitHub:** Requires account compromise.

**Mitigation:** No single proof is required to be verified onchain. The combination of ≥2 independent proofs from different systems makes full forgery very difficult.

---

### 3. Replay Attacks

**Attack:** Use a valid proof from one project to register a different one.

**Mitigation:** The DEPLOYER_SIG commitment includes:
```
keccak256("tethics:register:" + projectName + ":" + founderAddress)
```
The projectName and founderAddress are bound to the signature, so it can't be replayed for a different name or address.

Proof hashes also include `block.chainid`, preventing cross-chain replay.

---

### 4. Front-Running Registration

**Attack:** See a legitimate founder's `register()` transaction in the mempool, copy the proofs, and submit with higher gas to register first.

**Mitigation:**
- The DEPLOYER_SIG proof contains `founderAddress` bound to the signature. If an attacker copies the proof but uses their own address, the ecrecover check fails.
- If the attacker uses the same `founderAddress` as the victim (i.e., they copy the whole transaction), they still can't call `authorizeToken()` or `deployShield()` because those check `msg.sender == founder`.
- **Residual risk:** If an attacker front-runs with the victim's exact transaction data, they could register the project under the victim's address but the attacker paid gas. This is economically irrational but the 48-hour challenge window allows the true founder to recover.

---

### 5. Charity Address Griefing

**Attack:** Set the charity address to a contract that always reverts, preventing fund draining.

**Mitigation:**
- Charity address must be selected from a curated list of known-good addresses at the time of Shield deployment.
- If the charity address later becomes non-functional, `drainETH()` / `drainToken()` won't drain, but won't revert either: funds are held safely in the Shield.
- The community can call `drainToken()` again when/if the issue is resolved.

---

### 6. Oracle / DEX Manipulation

**Attack:** Manipulate the DEX price so the swap drains all tokens to charity with near-zero ETH output (sand-witching the charity).

**Impact:** Charity receives less ETH than expected. Scammer doesn't profit.

**Mitigation:** The charity drain isn't about maximizing charity value: it's about destroying unauthorized token upside. Even if the swap extracts minimal value, the goal (routing proceeds away from scammers) is achieved.

---

### 7. Shield Contract Griefing via notifyBuyers

**Attack:** Call `notifyBuyers()` with a huge array of addresses, causing gas OOM for legit callers.

**Mitigation:**
- `notifyBuyers()` is permissionless but the caller pays gas. There's no limit on the array size, but gas costs scale with array length: griefing is expensive for the attacker.
- Rate limiting ensures each holder can only be notified once per 24h, so spam notifications to the same addresses have no additional effect.

---

### 8. Registry DoS via reportUnauthorizedToken

**Attack:** Spam reports for valid projects with false token addresses.

**Impact:** Elevated reporter scores for the attacker, noisy events, Shield contract receives many callbacks.

**Mitigation:**
- Reporting requires paying gas: spam is expensive.
- False reports (for non-existent tokens) still increment `reporterScore`: the attacker gains meaningless reputation they paid for.
- The Shield callback is non-reverting: spam reports don't break anything.
- Off-chain tools filter by project and show only real unauthorized tokens.

---

### 9. Founder Abandons Project

**Attack:** Founder registers, deploys Shield, then abandons their keys. Unauthorized tokens proliferate with no one to authorize legitimate ones.

**Impact:** The Shield still works: it drains unauthorized token proceeds to charity. But no new tokens can be authorized.

**Mitigation:** This is a feature, not a bug. Abandoned founder keys can't authorize new tokens. The community still benefits from the automatic drain mechanism.

---

### 10. Cross-Chain Confusion

**Attack:** tethics deployed on Base. Attacker registers the same project name on Ethereum mainnet (different deployment) with weaker proofs.

**Mitigation:**
- Each chain deployment is independent. tethics on Base is authoritative for Base tokens.
- Proof hashes include `block.chainid`: a proof valid on Base is not valid on mainnet.
- Frontend and integrations should always specify the chain.

---

## Non-Goals

tethics does NOT:
- **Prevent token launches:** Anyone can still deploy any token
- **Provide legal protection:** This is a technical mechanism, not a legal one
- **Guarantee token quality:** A verified founder can still build a bad product
- **Prevent social engineering:** "This is the REAL token, ignore the Registry" scams are out of scope
- **Replace DYOR:** tethics is one signal among many

---

## Known Limitations

1. **ENS on L2:** ENS resolution isn't natively available on Base. ENS proofs are stored as claims + hashes and verified off-chain.

2. **Liquidity-dependent drains:** If an unauthorized token has no DEX liquidity, proceeds can't be swapped and are held in the Shield until liquidity forms.

3. **Fuzzy name matching in watcher:** The watcher uses heuristics to match token names to registered projects. There will be false positives and false negatives. The onchain registry is authoritative; the watcher is just a convenience layer.

4. **Challenge mechanism is v1 simplistic:** The "more proofs wins" dispute resolution is simple but gameable. Future versions should integrate proper arbitration.
