# Security Audit Notes

## Scope

This pass reviewed and hardened:

- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [Shield.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Shield.sol)
- [ShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/ShieldFactory.sol)
- [UpgradeableRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableRegistry.sol)
- [UpgradeableShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableShieldFactory.sol)
- [TransparentUpgradeableProxy.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/TransparentUpgradeableProxy.sol)
- [frontend/js/app.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/app.js)
- [frontend/js/ipfs.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/ipfs.js)
- [frontend/js/registry.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/registry.js)
- [solana/programs/tethics_registry/src/lib.rs](/Users/swarnava/Documents/Projects/tethics/solana/programs/tethics_registry/src/lib.rs)
- deployment scripts and test/build pipelines

This is an internal hardening pass, not a substitute for an independent third-party audit before mainnet launch.

## Fixed Findings

### 1. Incorrect deterministic Shield prediction

Severity: High

Problem:

- the old prediction path ignored the charity address even though the constructor encoded it into init code
- predicted addresses could be wrong in production

Fix:

- exact prediction now requires the charity address
- tests now verify predicted and deployed addresses match

Relevant files:

- [ShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/ShieldFactory.sol)
- [ShieldFactory.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/ShieldFactory.t.sol)

### 2. Broken token-drain routing semantics

Severity: Critical

Problem:

- token drains swapped into WETH but did not safely complete the unwrap / ETH routing path
- ETH emitted during unwrap could be forwarded unexpectedly through `receive()`
- events could imply successful charity routing when funds were not actually routed

Fix:

- added explicit wrapped-native acceptance gating during unwrap
- drain flow now tracks routed native amount directly
- charity transfer failure emits hold-pending-retry instead of false success
- integration and unit tests now cover the corrected path

Relevant files:

- [Shield.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Shield.sol)
- [Shield.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/Shield.t.sol)
- [Integration.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/Integration.t.sol)

### 3. Reporter reputation farming

Severity: High

Problem:

- the same reporter could repeatedly report the same unauthorized token and inflate `reporterScore`

Fix:

- duplicate reports are now blocked per `(project, token, reporter)`

Relevant files:

- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [Registry.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/Registry.t.sol)

### 4. Unsafe auto-transfer dispute logic

Severity: High

Problem:

- disputes could automatically transfer founder rights using a naive “more proofs wins” heuristic
- this was not production-safe governance

Fix:

- disputes are now review-first only
- the challenge path emits evidence onchain without auto-transferring control

Relevant files:

- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [Registry.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/Registry.t.sol)

### 5. Weak governance input validation

Severity: Medium

Problem:

- ownership transfer allowed a zero address target
- approver management accepted zero addresses
- external claim review could be finalized without a resolution hash

Fix:

- zero-owner and zero-approver checks added
- external claim reviews now require a non-zero resolution hash

Relevant files:

- [IRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/interfaces/IRegistry.sol)
- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)

### 6. Non-standard holder notification logging

Severity: Medium

Problem:

- holder notifications used a low-level assembly log with a hard-coded signature
- this was brittle and unnecessary

Fix:

- replaced with an explicit `HolderNotified` event

Relevant files:

- [IShield.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/interfaces/IShield.sol)
- [Shield.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Shield.sol)

### 7. Missing transparency anchors on external reviews and assets

Severity: High

Problem:

- cross-chain claims and asset records could previously be created with empty metadata URIs
- external claim reviews could previously be finalized without a public resolution URI
- that weakened the protocol's “everything important is publicly inspectable” model

Fix:

- external claims now require a non-empty metadata URI
- external claim reviews now require both a non-zero resolution hash and a non-empty resolution URI
- external asset authorizations and revocations now require a non-empty metadata URI
- zero-address token, shield, and additional-address inputs are now rejected explicitly

Relevant files:

- [IRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/interfaces/IRegistry.sol)
- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [UpgradeableRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableRegistry.sol)
- [Registry.t.sol](/Users/swarnava/Documents/Projects/tethics/contracts/test/Registry.t.sol)

### 8. Upgradeable implementation takeover and proxy misconfiguration risk

Severity: High

Problem:

- upgradeable implementation contracts were directly initializable
- proxy upgrades did not verify that the new implementation address actually contained code
- those are standard production hardening requirements for proxy deployments

Fix:

- `Initializable` now supports `_disableInitializers()`
- upgradeable reference implementations disable initialization in their constructors
- proxy constructor and upgrade paths now reject implementation addresses with no code
- the upgradeable registry now also rejects setting the shield factory to zero

Relevant files:

- [Initializable.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/Initializable.sol)
- [UpgradeableRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableRegistry.sol)
- [UpgradeableShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableShieldFactory.sol)
- [TransparentUpgradeableProxy.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/TransparentUpgradeableProxy.sol)

### 9. Frontend URI injection and browser credential persistence risk

Severity: High

Problem:

- the UI rendered untrusted `metadataURI` and website values into clickable links without protocol allow-listing
- browser-stored IPFS bearer tokens were persisted in `localStorage`, which unnecessarily widened the blast radius of any future XSS
- the EVM founder commitment helper had a packing bug that could generate the wrong signed message hash

Fix:

- untrusted external links are now filtered through an explicit allow-list for `https://`, `http://`, and `ipfs://`
- IPFS upload tokens are now stored in `sessionStorage` instead of `localStorage`
- the EVM registration commitment helper now uses the correct packed tuple shape

Relevant files:

- [app.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/app.js)
- [ipfs.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/ipfs.js)
- [registry.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/registry.js)

### 10. Solana program validation and asset-update gaps

Severity: High

Problem:

- the Solana registry program accepted empty authorities, empty URIs, empty hashes, and unbounded string inputs
- asset records were create-only, which prevented safe in-place transitions between authorized, unwanted, and revoked states for a given `(slug, assetType, assetId)` PDA

Fix:

- Solana instruction inputs now validate root authority, slug, display name, asset identifiers, metadata hash, and URI lengths
- asset records now use `init_if_needed`, allowing the same PDA to transition safely instead of forcing duplicate-account failures
- the program dependency now explicitly enables Anchor's `init-if-needed` support

Relevant files:

- [lib.rs](/Users/swarnava/Documents/Projects/tethics/solana/programs/tethics_registry/src/lib.rs)
- [Cargo.toml](/Users/swarnava/Documents/Projects/tethics/solana/programs/tethics_registry/Cargo.toml)

## Validation

Current verification results:

- `forge build`
- `forge test --offline`
- `cargo check -p tethics_registry`
- `npm run build:ts`
- `node --check frontend/js/app.js`
- `node --check frontend/js/ipfs.js`
- `node --check frontend/js/registry.js`
- `node --check frontend/js/solana-program.js`

The `--offline` flag is required in this environment to avoid the Foundry/macOS selector lookup crash path.

Cross-chain parity is now enforced onchain as well:
- EVM token contracts remain first-class authorized assets
- Solana mints and venue identities such as Bags creator wallets are now first-class external asset records in the registry
- the public UI can resolve those approvals directly from chain state instead of relying on bootstrap-only frontend data

## Residual Risks

These still need explicit treatment before calling the project “fully audited”:

1. Independent external audit
- the contracts now pass a stronger internal hardening pass, but that is not enough for mainnet assurance

2. Charity and router trust assumptions
- the factory still depends on owner-controlled router / WETH configuration in the upgradeable reference path

3. Cross-chain review quality
- the protocol can anchor evidence onchain, but reviewer judgment is still a human process
- the Solana path is now scaffolded as a native program, but it still needs real cluster deployment, account migration strategy, and dedicated program tests before mainnet use

4. Frontend operational security
- browser-based IPFS uploads still depend on user-managed credentials and correct CORS configuration
- session-scoped tokens reduce exposure, but the frontend still needs a careful CSP and deployment review before launch

5. Proxy governance risk
- upgradeable reference contracts introduce admin-key risk by design
- production governance around the proxy admin must be explicit

6. Shield swap-price protection
- the Shield drain path still depends on router execution without an onchain quoting/oracle layer
- before mainnet, this path should be upgraded to a slippage-bounded execution design rather than relying on permissive swap semantics
