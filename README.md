# TETHICS

**Open-source, fully onchain, zero-infrastructure protection for builders against unauthorized token launches across EVM and Solana.**

[![Tests](https://github.com/SwarnavaB/tethics/actions/workflows/test.yml/badge.svg)](https://github.com/SwarnavaB/tethics/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## The Problem

On permissionless chains, anyone can deploy a token using a legitimate project's name. Buyers assume the token is coupled to the product: it never is. Money flows in, the price dumps, and the community blames the builder. This has happened repeatedly (Sovra, CONWAY/Sigil, Clawdbot/Peter Steinberger) and actively drives builders away from crypto.

## The Solution

TETHICS is a public utility that:

1. **Lets founders cryptographically prove their identity** and disavow unauthorized tokens
2. **Automatically destroys the economic upside** of unauthorized tokens (routes funds to charity)
3. **Notifies token buyers** that their token is not authorized
4. **Makes verification queryable** by any wallet, frontend, or block explorer
5. **Supports chain-native governance across EVM and Solana**
6. **Requires zero backend infrastructure** beyond public chains and static assets

## Ecosystem Scope

TETHICS is designed for projects that may be impersonated across multiple ecosystems.

- **EVM:** onchain registry, project approvals, token authorization, charity-governed Shield flows
- **Solana:** native Solana governance path, project proposals, asset records, and reviewer delegation
- **Bags.fm:** first-class Solana venue support for creator-wallet and mint review
- **Cross-ecosystem projects:** one project can track official and unwanted assets across both EVM and Solana

## Hard Constraints

- **Zero infrastructure costs:** No servers, databases, or hosted APIs. Smart contracts + static frontend only.
- **Zero legal burden:** No DMCA, no cease-and-desist. All mechanisms are purely technical and economic.
- **Cryptographically rigorous verification:** Minimum 2 independent proofs (onchain + off-chain).
- **Founders who want tokens are not blocked:** The system creates a verifiable yes/no: "Did the founder authorize this token?"
- **Fully open source:** MIT licensed. Fork it, deploy it anywhere.
- **Two deployment modes:** immutable core deployment, or upgradeable reference deployment for the coordination layer.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Shared Product Layer                                        │
│  • Static frontend                                           │
│  • Browser-side artifact hashing + IPFS upload               │
│  • Public verification and governance views                  │
└───────────────────────┬───────────────────────────┬──────────┘
                        │                           │
┌───────────────────────▼─────────────────┐ ┌──────▼──────────────────────────┐
│  EVM Coordination Layer                 │ │  Solana Coordination Layer      │
│  • Registry / approvals / delegation    │ │  Native Solana registry program │
│  • Token authorization / revocation     │ │  Proposal review / delegation   │
│  • ShieldFactory + Shield charity flow  │ │  Mint / creator / asset records │
└───────────────────────┬─────────────────┘ └──────┬──────────────────────────┘
                        │                           │
┌───────────────────────▼──────────────────────────────────────────────────────┐
│  Evidence + Detection Layer                                                  │
│  • Content-addressed artifacts (IPFS / public URIs)                          │
│  • Community-run watchers and venue adapters                                 │
│  • Bags.fm support for Solana launch and creator evidence                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### For Builders (Founders)

1. **Open the TETHICS frontend** and choose the relevant ecosystem flow
2. **Connect your EVM or Solana wallet**
3. **Submit your project proposal** with proofs, wallets, and public evidence
4. **Wait for curator / delegated reviewer approval**
5. **Manage official and unwanted assets** across both ecosystems from the dashboard
6. **For EVM projects, optionally deploy a Shield** and choose an approved charity route

After approval, anyone querying the protocol gets an onchain answer about whether an asset is authorized, unwanted, pending, or revoked.

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

Reporters earn onchain reputation (`Registry.reporterScore(address)`), and Solana/Bags evidence can be attached through the cross-chain review flow.

---

## Development

### Prerequisites

- [Foundry](https://getfoundry.sh/): Solidity development toolchain
- [Node.js](https://nodejs.org/) 18+: For the watcher CLI

## Deployment Notes

- Frontend deployment to `tethics.eth` and `tethics.sol`: [docs/FRONTEND-DOMAIN-DEPLOYMENT.md](docs/FRONTEND-DOMAIN-DEPLOYMENT.md)

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
# No build step required. Just serve the static frontend:
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

### Cross-Chain Tooling

```bash
# Install all workspace dependencies
npm install

# Build the shared, Solana, Bags, and EVM watcher packages
npm run build:ts

# Re-evaluate a local Bags launch fixture against the static project records
node watchers/solana/bags/dist/main.js recheck \
  --launch-file watchers/solana/bags/fixtures/sample-launch.json

# Query Bags creator data for a mint and emit records output
node watchers/solana/bags/dist/main.js mint \
  --mint <SOLANA_MINT> \
  --token-name <NAME> \
  --token-symbol <SYMBOL>
```

### Curator Attestations

```bash
# Create an unsigned project approval attestation
npx tethics-solana create-project-approval \
  --issuer <YOUR_TETHICS_SOL_PUBLIC_KEY> \
  --slug myproject \
  --display-name "My Project" \
  --founder-wallets <SOLANA_WALLET_1>,<SOLANA_WALLET_2> \
  --output frontend/data/curation/myproject-project-approval.unsigned.json

# Sign it with a Solana keypair file or TETHICS_SOL_SECRET_KEY
npx tethics-solana sign-attestation \
  --input frontend/data/curation/myproject-project-approval.unsigned.json \
  --output frontend/data/curation/myproject-project-approval.signed.json \
  --secret-key-file /path/to/solana-keypair.json

# Verify the signed attestation
npx tethics-solana verify-attestation \
  --input frontend/data/curation/myproject-project-approval.signed.json
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

### Upgradeable Reference Deployment

```bash
forge script script/DeployUpgradeable.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --verify
```

This deploys proxy-based reference contracts for the registry and shield factory. Individual Shield instances remain immutable.
Approved Solana mints and Bags creator identities are also stored as first-class onchain registry records, alongside EVM token authorization.

### Solana

The repo also includes a native Solana registry program scaffold and Solana-side client/tooling in [`solana/`](/Users/swarnava/Documents/Projects/tethics/solana). Solana projects are intended to be governed through Solana-native flows, not permanently through the EVM registry.

Bootstrap a Devnet deployment by initializing the config PDA after program deploy:

```bash
cd solana
npm install
npm run build

node dist/cli.js initialize-program \
  --rpc-url https://api.devnet.solana.com \
  --program-id <DEPLOYED_PROGRAM_ID> \
  --root-authority <YOUR_SOLANA_ROOT_AUTHORITY> \
  --secret-key-file ~/.config/solana/id.json
```

## Web Frontend

The web surface lives entirely under `frontend/`:

- `frontend/index.html` - public landing page
- `frontend/app.html` - application shell
- `frontend/css/` - shared styling
- `frontend/js/` - browser clients and UI logic
- `frontend/assets/` - TETHICS brand assets

There is no root-level web entrypoint. Serve `frontend/` as the static site directory.

## Planning Docs

- `docs/PROJECT-PLAN.md` - detailed product roadmap for finishing tethics, including Solana and Bags.fm support
- `docs/PRODUCTION-ARCHITECTURE-PLAN.md` - production-grade chain-native governance plan rooted in `tethics.eth`
- `docs/ARCHITECTURE.md` - target cross-chain architecture
- `docs/ONCHAIN-UI-SPEC.md` - static frontend plus onchain-state implementation spec
- `docs/DEPLOYMENT-CHECKLIST.md` - concrete rollout checklist for the upgraded registry and static frontend
- `docs/SECURITY-AUDIT.md` - internal hardening findings, fixes, and residual risks
- `docs/UPGRADEABILITY.md` - proxy-based reference deployment model
- `docs/SCHEMA.md` - canonical shared data model across EVM, Solana, and venue adapters
- `docs/SOLANA-MVP.md` - Solana implementation spec for the first release
- `docs/UI-PARITY-IMPLEMENTATION.md` - frontend refactor plan for true EVM/Solana parity
- `docs/BAGS-ADAPTER.md` - Bags.fm detection and evidence adapter spec
- `docs/THREAT-MODEL.md` - current threat model

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
├── frontend/                     # Landing page + app shell + static assets
├── watcher/                      # Legacy TypeScript CLI detector
├── watchers/                     # Venue-specific watcher packages
├── shared/                       # Shared schema/types package
├── solana/                       # Solana CLI + native program scaffold
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
