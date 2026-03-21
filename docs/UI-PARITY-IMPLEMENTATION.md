# UI Parity Implementation

## Goal

Define the UI refactor needed to reach true parity between EVM and Solana.

Parity here means:

- both ecosystems have real connect flows
- both ecosystems have founder submission flows
- both ecosystems have reviewer approval flows
- both ecosystems expose wanted and unwanted asset records
- the user sees one project-centric product, not two disconnected dashboards

## Principle

The UI should be project-centric and execution-layer specific.

That means:

- the user thinks in terms of projects and assets
- the UI decides whether the action is an EVM action or a Solana action
- chain-native permissions determine what controls appear

## Current State

Already in place:

- EVM wallet connect
- Solana wallet connect
- browser-side artifact generation
- browser-side IPFS upload
- EVM founder registration flow
- EVM curator review flow
- Solana proposal drafting and proof signing

Still needing correction:

- Solana proposal submission is still modeled in code as an EVM external-claim path
- Solana review is still modeled in code as an EVM review path
- the dashboard is still EVM-primary
- project pages are not yet truly cross-chain first

## Target Screens

### 1. Unified Project Verify

Inputs:

- project slug
- EVM token
- Solana mint
- creator wallet

Output sections:

- project identity
- EVM official assets
- Solana official assets
- EVM unwanted assets
- Solana unwanted assets
- review timeline
- evidence bundles

### 2. Founder Submit

Tabs:

- `EVM Project`
- `Solana Project`
- `Cross-Chain Project`

The form should build the same project artifact shape, but submit to:

- EVM registry for EVM project registration
- Solana program for Solana project proposal
- both when the founder wants immediate cross-chain protection

### 3. Reviewer Console

Sections:

- EVM pending registrations
- Solana pending proposals
- EVM asset review tools
- Solana asset review tools
- delegation and governance controls

The reviewer should not have to mentally map Solana into an EVM queue.

### 4. Project Admin Workspace

After approval, a founder should be able to manage:

- official EVM tokens
- official Solana mints
- approved EVM launchers
- approved Solana creator / launch wallets
- unwanted EVM assets
- unwanted Solana assets

Only controls permitted by the connected chain-native wallet should appear.

## Permission Model In UI

### EVM Controls

Show EVM admin or approver controls only if:

- connected EVM wallet is EVM owner, or
- connected EVM wallet is an EVM approver, or
- connected EVM wallet is the founder for the specific EVM project action

### Solana Controls

Show Solana admin or approver controls only if:

- connected Solana wallet has active Solana program authority, or
- connected Solana wallet is an approved Solana approver, or
- connected Solana wallet is the founder for the specific Solana proposal or asset action

### Identity Display

The header and dashboard should always show:

- connected EVM wallet
- connected Solana wallet
- EVM role state
- Solana role state
- proof state where relevant

## Data Sources

### EVM Reads

- registry reads
- EVM event scans

### Solana Reads

- Solana account fetches
- Solana program logs or indexed account summaries

### Shared Reads

- artifact URIs
- Bags evidence bundles
- public content-addressed metadata

## Frontend Refactor Plan

### Phase 1

- split the dashboard into explicit EVM and Solana review sections
- stop labeling Solana approval state as “external claim review”
- introduce project-level wanted/unwanted asset sections

### Phase 2

- add Solana program client module
- replace Solana submit/review actions that currently call EVM registry methods
- load Solana role state and proposal state from Solana

### Phase 3

- build unified project pages that merge EVM and Solana records by slug
- build a project timeline view across both ecosystems
- add governance pages for EVM and Solana roles

## Production UX Constraints

- no control should appear if the connected wallet cannot actually execute it
- no approval badge should appear without authoritative chain state
- Solana data must not be presented as final if it only exists in a local draft
- cross-chain pages must clearly label which chain approved or revoked each asset

## Immediate Code Refactor Targets

Current places that should change next:

- [app.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/app.js)
  remove Solana reliance on `submitExternalClaim(...)` and `reviewExternalClaim(...)`
- [registry.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/registry.js)
  keep for EVM only and add a separate Solana program client
- add `frontend/js/solana-program.js`
  for Solana account reads and writes
- update verification rendering in [app.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/app.js)
  so Solana program state is primary for Solana approvals
