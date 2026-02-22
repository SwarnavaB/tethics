# Architecture

## Overview

tethics is a four-layer system deployed on Base (Ethereum L2). All layers are fully onchain or decentralized: no servers, no databases, no admin keys.

```
Layer 1: Registry.sol        : Single immutable ownerless contract
Layer 2: Shield.sol          : Per-founder charity drain + attestation
Layer 3: Static Frontend     : IPFS-hosted SPA
Layer 4: Watcher CLI         : Community-run detection script
```

---

## Layer 1: Registry

**File:** `contracts/src/Registry.sol`

The Registry is the canonical truth about which projects are verified and which tokens are authorized. It is deployed once per chain and never upgraded.

### Storage

```solidity
mapping(bytes32 => Project) private _projects;          // nameHash → Project
mapping(bytes32 => mapping(address => bool)) private _authorizedTokens; // nameHash → token → bool
mapping(address => uint256) public reporterScore;       // address → report count
```

### Project Name Normalization

All project names are normalized before storage: lowercased and trimmed. This prevents trivial duplicates ("MyProject" = "myproject" = "  MYPROJECT  "). Normalization uses `StringUtils.normalize()`.

Valid names: 2–64 characters, alphanumeric + hyphens + underscores (`[a-z0-9\-_]` after normalization).

### Registration Flow

```
Founder → register("projectname", proofs[]) →
  1. Validate name (isValidName)
  2. Check not already registered
  3. Validate proofs (≥2, different categories)
  4. Store project + 48h challenge deadline
  5. Emit ProjectRegistered
```

### Verification Proofs

See [VERIFICATION.md](VERIFICATION.md) for full details.

Minimum 2 proofs from different categories:
- `PROOF_DEPLOYER_SIG (1)`: ECDSA sig from deployer wallet, verified onchain via ecrecover
- `PROOF_ENS (2)`: ENS name claim (stored as hash, verified off-chain)
- `PROOF_DNS_TXT (3)`: DNS TXT record hash (off-chain anchor)
- `PROOF_GITHUB (4)`: GitHub attestation hash (off-chain anchor)
- `PROOF_CONTRACT_OWNER (5)`: Existing contract ownership claim (off-chain anchor)

### Challenge Period

After registration, a 48-hour window allows disputes. During this window, anyone can call `disputeRegistration()` with stronger proofs to challenge ownership. After the window closes, registration is final.

### Token Authorization

Only the registered founder can authorize or revoke token contracts. Once authorized, `isAuthorized(name, tokenAddress)` returns `true`: this is the core primitive for wallets and frontends.

### Reporting

Any address can call `reportUnauthorizedToken(name, tokenAddress)` if the token is not in the authorized list. This:
1. Increments `reporterScore[reporter]`
2. Emits `UnauthorizedTokenReported`
3. Forwards to the linked Shield contract (non-reverting)

---

## Layer 2: Shield

**Files:** `contracts/src/Shield.sol`, `contracts/src/ShieldFactory.sol`

Each registered founder can deploy exactly one Shield via `ShieldFactory.deployShield()`. The factory uses CREATE2 so the Shield address is deterministic from (founder, projectName).

### Charity Drain

The core economic mechanism:

```
Unauthorized token enters Shield
    → IERC20.approve(swapRouter, balance)
    → DEX.exactInputSingle(token → WETH)
    → shield.balance += ETH
    → ETH.transfer(charityAddress)
```

**Single-transaction path:** founder never has custody. If the swap fails (no liquidity), tokens are held and anyone can retry by calling `drainToken()` again later.

**Charity address is immutable:** set at Shield deployment, cannot be changed. This prevents the founder from routing to themselves.

### Attestation Events

The Shield emits rich events that allow complete reconstruction of history without reading contract storage:

```solidity
event ShieldActive(projectName, shieldAddress, charityAddress)
event UnauthorizedTokenDetected(projectName, tokenContract, reporter)
event FundsRoutedToCharity(tokenContract, amount, charityAddress)
event FundsHeldPendingRetry(tokenContract, amount, reason)
event BuyersNotified(unauthorizedToken, holderCount, caller)
```

### Buyer Notification

Any address can call `Shield.notifyBuyers(unauthorizedToken, holders[])` with a list of holder addresses (off-chain determined). This:
- Rate-limits notifications: 1 per holder per token per 24h
- Increments per-holder notification count (for reputation)
- Emits `BuyersNotified` event

The holder list comes from the Watcher (Layer 4) scanning token transfer events off-chain.

### Factory (CREATE2)

`ShieldFactory.deployShield(projectName, charityAddress)` deploys a Shield with a deterministic address. Only the registered founder can deploy their Shield. The factory automatically calls `Registry.linkShield()` to link the deployed Shield.

```solidity
bytes32 salt = keccak256(abi.encodePacked(founder, keccak256(bytes(normalized))));
// CREATE2 deployed at predictable address
```

---

## Layer 3: Static Frontend

**Directory:** `frontend/`

A single-page application with hash-based routing. No build step: just HTML, CSS, and ES modules loaded via CDN.

### Pages

| Route | Purpose |
|-------|---------|
| `#/` | Home / Project search |
| `#/register` | Guided registration flow |
| `#/dashboard` | Founder management dashboard |
| `#/verify/:name` | Public verification page (shareable) |
| `#/leaderboard` | Top reporters by score |

### Hosting

Deployable to:
- **IPFS** via Fleek or Pinata (free tier)
- **ENS** domain `tethics.eth` pointing to IPFS hash
- **GitHub Pages** as a fallback

### Wallet Integration

Uses [viem v2](https://viem.sh/) for chain interaction. Compatible with MetaMask, Coinbase Wallet, WalletConnect (via `window.ethereum`).

---

## Layer 4: Watcher CLI

**Directory:** `watcher/`

A TypeScript CLI tool that community members run locally to detect unauthorized tokens.

```bash
npx tethics-watcher --chain base --rpc <URL> --reporter-key <KEY>
```

### Detection Flow

```
1. Subscribe to factory events (Uniswap V3, V2 clones)
2. New token detected → extract name/symbol
3. Normalize name → query Registry for fuzzy matches
4. If match found AND token NOT authorized → reportUnauthorizedToken()
5. Optionally: scan token transfers for holders → notifyBuyers()
```

### Incentives

Reporter pays their own gas. Incentive is onchain reputation (`reporterScore`) and community goodwill. The leaderboard in the frontend surfaces top reporters.

---

## Security Properties

### Immutability

- Registry has no owner, no upgrade mechanism, no admin keys
- Shield charity address is immutable post-deployment
- ShieldFactory just deploys: no ongoing state
- The system is a public utility, not a product

### Impersonation Resistance

To impersonate a registered project, an attacker must:
- Compromise the founder's private key (for DEPLOYER_SIG proof), AND
- Control the founder's ENS name or DNS record (for second proof)

These are independent systems: compromising one doesn't compromise the other.

### Griefing Resistance

- Name squatting: 48-hour challenge window + multi-proof requirement
- Charity griefing: charity address is set to a known-good address at deployment; if it reverts, ETH is held (not lost)
- Reporter spam: reporterScore only increases for unauthorized tokens (can't spam authorized ones)
- Notification spam: 24-hour rate limit per holder per token

### Economic Security

The charity drain makes unauthorized token ownership economically worthless if the Shield is active. Any proceeds that flow to the Shield address get routed to charity, not the scammer.

---

## Gas Costs (Base L2 estimates)

| Operation | Approx Gas | Approx Cost (0.1 Gwei) |
|-----------|-----------|------------------------|
| `register()` | ~200,000 | ~$0.02 |
| `deployShield()` | ~800,000 | ~$0.08 |
| `reportUnauthorizedToken()` | ~50,000 | ~$0.005 |
| `authorizeToken()` | ~50,000 | ~$0.005 |
| `drainToken()` | ~100,000 + swap | ~$0.01+ |
| `notifyBuyers(N holders)` | ~20,000 + N*5,000 | ~$0.002+ |

*Base L2 has ~10x lower gas costs than Ethereum mainnet.*

---

## Deployment Bootstrap

Registry and ShieldFactory have a circular dependency:
- Registry needs the ShieldFactory address (to validate `linkShield` caller)
- ShieldFactory needs the Registry address (to call `linkShield`)

**Solution:** Use Ethereum nonce pre-computation. Since contract addresses are deterministic from (deployer, nonce), we can predict the ShieldFactory address before deploying it, then pass that to the Registry constructor.

See `script/Deploy.s.sol` for the implementation.
