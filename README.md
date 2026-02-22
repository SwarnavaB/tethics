# tethics

**Open-source, fully onchain, zero-infrastructure protection for builders against unauthorized token launches.**

[![Tests](https://github.com/SwarnavaB/tethics/actions/workflows/test.yml/badge.svg)](https://github.com/SwarnavaB/tethics/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

On permissionless chains, anyone can deploy a token using a legitimate project's name. Buyers assume the token is coupled to the product: it never is. Money flows in, the price dumps, and the community blames the builder. This has happened repeatedly (Sovra, CONWAY/Sigil, Clawdbot/Peter Steinberger) and actively drives builders away from crypto.

## The Solution

tethics is a public utility that:

1. **Lets founders cryptographically prove their identity** and disavow unauthorized tokens
2. **Automatically destroys the economic upside** of unauthorized tokens (routes funds to charity)
3. **Notifies token buyers** that their token is not authorized
4. **Makes verification queryable** by any wallet, frontend, or block explorer
5. **Requires zero ongoing effort** from founders after initial registration

## Hard Constraints

- **Zero infrastructure costs:** No servers, databases, or hosted APIs. Smart contracts + static frontend only.
- **Zero legal burden:** No DMCA, no cease-and-desist. All mechanisms are purely technical and economic.
- **Cryptographically rigorous verification:** Minimum 2 independent proofs (onchain + off-chain).
- **Founders who want tokens are not blocked:** The system creates a verifiable yes/no: "Did the founder authorize this token?"
- **Fully open source:** MIT licensed. Fork it, deploy it anywhere.
- **Ownerless contracts:** No admin keys, no upgrades, no multisig. Public utility.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Registry (deployed once, lives forever)       │
│  • Founder registration with multi-signal proofs        │
│  • Token authorization / revocation                     │
│  • Permissionless reporting + reporter reputation       │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Layer 2: Shield (one per founder, via ShieldFactory)   │
│  • Charity drain: token → DEX swap → charity            │
│  • Attestation beacon (rich events for indexing)        │
│  • Buyer notification (rate-limited, permissionless)    │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Layer 3: Static Frontend (IPFS + ENS)                  │
│  • Search, Register, Dashboard, Verify, Leaderboard     │
│  • No build step, no backend, deployable anywhere       │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│  Layer 4: Watcher (community-run CLI)                   │
│  • Monitors token factory events on Base                │
│  • Auto-reports matches to Registry                     │
│  • Reporter earns onchain reputation                   │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### For Builders (Founders)

1. **Register your project** at `https://tethics.eth` (or directly via the frontend)
2. **Connect wallet** and enter your project name
3. **Submit 2+ verification proofs** (deployer signature + ENS, DNS, GitHub, or existing contract)
4. **Select a charity** for unauthorized token proceeds
5. **Deploy your Shield:** single transaction, done forever

After registration, anyone querying `Registry.isAuthorized("yourproject", tokenAddress)` gets an instant onchain answer.

### For Token Buyers / Wallets

Query before you buy:

```js
const isLegit = await registry.read.isAuthorized(["projectname", tokenAddress]);
```

Or via the frontend: `https://tethics.eth/#/verify/projectname`

### For Community Reporters

Run the watcher to automatically detect and report unauthorized tokens:

```bash
npx tethics-watcher \
  --chain base \
  --rpc https://mainnet.base.org \
  --reporter-key <YOUR_PRIVATE_KEY>
```

Reporters earn onchain reputation (`Registry.reporterScore(address)`).

---

## Development

### Prerequisites

- [Foundry](https://getfoundry.sh/): Solidity development toolchain
- [Node.js](https://nodejs.org/) 18+: For the watcher CLI

### Smart Contracts

```bash
cd contracts

# Install dependencies (forge-std)
forge install

# Build
forge build

# Run tests (37 tests, ~140ms)
forge test -v

# Run with gas report
forge test --gas-report
```

### Frontend

```bash
# No build step required. Just serve:
cd frontend
python3 -m http.server 8080
# Open http://localhost:8080
```

### Watcher CLI

```bash
cd watcher
npm install
npm run build
node dist/index.js --chain base --rpc <RPC_URL> --reporter-key <KEY> --dry-run
```

---

## Deployment

### Base Sepolia (Testnet)

```bash
cd contracts
cp .env.example .env  # fill in PRIVATE_KEY and BASE_SEPOLIA_RPC
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
```

### Base Mainnet

```bash
forge script script/Deploy.s.sol --rpc-url $BASE_RPC --broadcast --verify
```

The deploy script uses nonce pre-computation to bootstrap the circular dependency between Registry and ShieldFactory. See `script/Deploy.s.sol` for details.

---

## Verification Proof Types

| Type | Onchain Verifiable | Description |
|------|--------------------|----|
| `DEPLOYER_SIG` | ✓ (ecrecover) | Sign registration commitment from deployer wallet |
| `ENS` | Partial (name claim stored) | ENS name resolves to founder address |
| `DNS_TXT` | ✗ (hash anchored) | DNS TXT record `tethics=<address>` |
| `GITHUB` | ✗ (hash anchored) | GitHub attestation via signed commit or EAS |
| `CONTRACT_OWNER` | ✗ (hash anchored) | Proof of ownership of existing deployed contracts |

**Minimum 2 proofs from different categories required.** At least one should be onchain verifiable.

---

## Charity Routing

When unauthorized token proceeds enter the Shield:

```
Token → Shield.drainToken() → DEX Swap (Uniswap V3 / Aerodrome) → ETH → Charity
```

- **Founder never has custody:** single-transaction path
- **Charity address is immutable:** set at deployment, cannot change
- **Swap failure fallback:** tokens held until liquidity exists, then retry
- **All routing is onchain:** every swap, every transfer logged via events

Approved charity options include: GiveDirectly, Gitcoin Grants, Protocol Guild, The Giving Block.

---

## Contract Addresses

| Contract | Base Sepolia | Base Mainnet |
|---|---|---|
| Registry | `TBD` | `TBD` |
| ShieldFactory | `TBD` | `TBD` |

*Will be updated after testnet deployment.*

---

## Integration

Wallets, frontends, and block explorers can integrate with a single view call:

```solidity
IRegistry registry = IRegistry(REGISTRY_ADDRESS);

// Check if a token is authorized
bool authorized = registry.isAuthorized("projectname", tokenAddress);

// Get full project info
IRegistry.ProjectView memory info = registry.getProjectInfo("projectname");
```

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for full integration guide.

---

## Repository Structure

```
tethics/
├── contracts/
│   ├── src/
│   │   ├── Registry.sol          # Core registry
│   │   ├── ShieldFactory.sol     # CREATE2 factory
│   │   ├── Shield.sol            # Charity drain + notifications
│   │   ├── interfaces/           # IRegistry, IShield, ISwapRouter
│   │   └── libraries/            # VerificationLib, StringUtils
│   ├── test/                     # 37 tests across 4 suites
│   └── script/                   # Deploy + example scripts
├── frontend/                     # Static HTML/CSS/JS SPA
├── watcher/                      # TypeScript CLI detector
└── docs/                         # Architecture, threat model, etc.
```

---

## Contributing

tethics is fully open source (MIT). Contributions welcome:

- **Smart contracts:** Improve gas efficiency, add new proof types, add L2 support
- **Frontend:** Better UX, mobile support, internationalization
- **Watcher:** More factory integrations, better fuzzy matching
- **Documentation:** Translations, tutorials, integration examples

Please open issues and PRs on GitHub.

---

## License

MIT: see [LICENSE](LICENSE)

---

*Built to protect builders. Zero tolerance for scammers.*
