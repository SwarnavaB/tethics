# Onchain UI Spec

## Goal

Ship tethics as a thin-client public good:

- no private database as source of truth
- no hidden moderation backend
- no opaque claim queue
- all critical state visible onchain
- all large artifacts publicly addressable and hash-verifiable from the browser

The UI should be able to load from a static host and resolve protocol state directly from chain data plus public artifact URIs.

## Design Rules

1. EVM and Solana each have their own chain-native authoritative state.
2. The frontend unifies those records into one project-centric product view.
3. Large bundles are stored offchain, but always content-addressed and hash-anchored on the relevant chain.
4. The browser builds canonical JSON, computes the anchored hash locally, and verifies fetched artifacts locally.
5. Reviewer actions are chain transactions, not admin-panel database mutations.

## State Split

### Onchain

Keep these onchain:

- project claim ids
- normalized project names and name hashes
- proposer wallets
- reviewer / approver roles
- claim status
- approval / rejection decisions
- review timestamps
- approved EVM tokens
- approved Solana mints
- approved Bags creator wallets
- revocations
- disputes
- reporter / reviewer reputation
- artifact hashes and public URIs

### Offchain But Public

Keep these offchain and reference them by hash + URI:

- founder proposal bundles
- review notes
- Bags evidence bundles
- screenshots
- signed Solana declarations
- curator-issued signed artifacts
- challenge evidence

Preferred storage:

1. IPFS
2. Arweave mirror later
3. plain HTTPS only as a temporary fallback

## Protocol Objects

### 1. EVM Project Registration

Already implemented:

- founder submits registration
- claim becomes pending
- owner or approver approves / rejects
- founder manages authorized EVM assets after approval

This remains the authoritative EVM-native path.

### 2. Cross-Chain Claim Artifact

This is the cross-chain transparency primitive, but not the substitute governance layer for Solana.

Fields:

- `claimId`
- `nameHash`
- `name`
- `ecosystem`
- `proposer`
- `payloadHash`
- `metadataURI`
- `submittedAt`
- `reviewed`
- `approved`
- `reviewer`
- `reviewedAt`
- `resolutionHash`
- `resolutionURI`
- `reviewNotes`

Lifecycle:

1. Founder builds canonical proposal bundle in browser
2. Browser computes payload hash
3. Founder uploads bundle to IPFS
4. Founder anchors the claim on the relevant chain
5. Reviewer inspects artifact and evidence
6. Reviewer uploads decision bundle to IPFS
7. Reviewer finalizes the review on the relevant chain

### 3. Asset Records

Each chain should support explicit asset records for:

- EVM token contract
- Solana mint
- Bags creator wallet
- additional founder wallet

Each record should support:

- approve
- revoke
- evidence URI / hash
- actor
- timestamp

## Browser-Only Artifact Pipeline

The frontend should do all of this locally:

1. collect form input
2. build canonical JSON
3. compute hash
4. let user download the artifact immediately
5. optionally upload to IPFS from browser
6. submit the onchain anchor using the same hash
7. later verify downloaded or fetched content against the onchain hash

### Canonicalization

Rules:

- JSON keys sorted recursively
- arrays preserved in input order
- no derived fields inside the hashed payload
- UTF-8 encoded before hashing

### Hashing

Two hashes matter:

- protocol anchor hash for the contract
- browser integrity hash for local verification UX

For consistency, the UI should use the same canonical payload bytes before computing any hash.

## UI Requirements

### Founder

Must be able to:

- connect EVM wallet
- connect Solana wallet
- create a claim package in browser
- download the exact canonical artifact
- enter or receive a public artifact URI
- anchor the claim on the correct chain
- track status from chain-native events

### Reviewer

Must be able to:

- open pending onchain claims
- inspect proposal artifact URI
- inspect Bags evidence URI
- approve or reject onchain
- anchor review artifact URI and hash
- manage delegated reviewers if owner

### Public Verification

Must be able to:

- search by project name
- search by EVM token
- search by Solana mint
- inspect public review timeline
- inspect claim hash and artifact URI
- verify fetched artifact integrity in browser

### Governance Transparency

Must be able to:

- inspect EVM owner / approvers
- inspect Solana authority / approvers
- inspect reviewer actions
- inspect claim and review history
- inspect disputes and revocations

## No-Backend Architecture

### What the frontend reads

- direct RPC reads
- contract event scans
- artifact URIs

### What the frontend writes

- contract transactions
- optional artifact uploads from browser

### What does not exist

- private moderation queue
- app database
- server-side claim reconciler
- hidden manual review state

## Deployment Plan

### Phase 1

- deploy upgraded EVM registry
- bind bootstrap governance to the wallet controlling `tethics.eth`
- ship EVM founder and curator UI
- ship browser-side canonical artifact generation
- ship browser-side IPFS upload using user-supplied credentials or local IPFS API
- ship artifact integrity verification in UI

### Phase 2

- deploy Solana registry program
- ship Solana founder and curator UI against Solana-native approval state
- support cross-chain project pages with assets on both ecosystems
- add dispute artifacts and review artifacts in UI

### Phase 3

- add delegated reviewer governance
- add reputation / activity views
- add optional public indexing if RPC scans become too heavy

## Practical Constraints

1. Do not store full JSON onchain.
2. Do not make Bags detection a trusted centralized service.
3. Do not let the UI display unverifiable approvals.
4. Do not let artifact hashes be produced from non-canonical JSON.
5. Do not introduce backend-managed state unless the chain and artifact layer are clearly insufficient.

## Immediate Implementation Work

1. Finalize and deploy the upgraded EVM registry.
2. Specify and implement the Solana registry program.
3. Replace placeholder registry addresses in the frontend.
4. Add a founder flow for “build bundle -> hash -> upload -> anchor” on each chain.
5. Add a reviewer flow for “inspect -> upload decision -> review onchain” on each chain.
6. Add public artifact verification widgets in the UI.
