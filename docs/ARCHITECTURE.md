# Architecture

## Overview

This document now assumes the production target is chain-native governance, not Solana-through-EVM coordination.

tethics is a cross-chain project verification and token authorization system.

Its job is to answer:

> Did the real founder authorize this token launch on this chain and venue?

The current target ecosystems are:

- EVM, starting with Base
- Solana, starting with Bags.fm-originated launches

The system is intentionally hybrid:

- chain-native authoritative records on each ecosystem
- offchain indexing and venue adapters for detection and evidence
- static or mostly static public verification surfaces

This is a product architecture, not just a contract architecture.

---

## System Layers

```text
Layer 1: Identity And Approval
  Project registration, proofs, founder identities, curator/approver review

Layer 2: Chain Authorization
  EVM registry state, Solana attestations/program records, authorized assets and launch wallets

Layer 3: Detection And Evidence
  Venue adapters, watchers, matchers, confidence scoring, evidence bundles

Layer 4: Distribution And Verification
  Public verification pages, feeds, dashboards, reviewer queue, integration APIs
```

---

## Layer 1: Identity And Approval

This layer defines the canonical project record.

Core concepts:

- one project slug per project
- multiple founder identities
- multiple proof types
- explicit approval workflow
- explicit reviewer actions

### Inputs

- EVM wallet proofs
- Solana wallet proofs
- ENS/SNS proofs
- DNS proofs
- GitHub proofs
- venue identity proofs

### Outputs

- approved project records
- approved founder identity records
- review log

### Authority Model

Early phase:

- bootstrap governance starts from the EVM wallet that controls `tethics.eth`
- that root designates the initial Solana curator authority
- EVM permissions are exercised on EVM
- Solana permissions are exercised on Solana

Later phases:

- delegated approvers on both ecosystems
- public challenge workflow
- community review and governance

---

## Layer 2: Chain Authorization

Authorization is chain-specific.

## EVM Authorization

The EVM implementation lives in:

- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [ShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/ShieldFactory.sol)
- [Shield.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Shield.sol)

### EVM Responsibilities

- register projects
- approve or reject pending projects
- authorize token contracts
- revoke token contracts
- record unauthorized token reports

### EVM Notes

- Base is the first production target
- Shield remains optional for v1 product value
- reliable authorization state matters more than aggressive routing mechanics

## Solana Authorization

The production target is a native Solana registry program.

### Solana Responsibilities

- approve projects and founder identities
- authorize launch wallets
- authorize mints
- publish unauthorized launch determinations
- preserve review history and evidence references
- delegate approver and reviewer roles on Solana

### Solana Notes

- `tethics.sol` or `swarnava.sol` may be the initial public curator identity, but authority must be represented by Solana-native signer control
- signed attestations can still exist as mirrors or artifacts, but they are not the long-term governance layer
- Solana projects should not depend on EVM review transactions for authoritative approval

---

## Layer 3: Detection And Evidence

This layer discovers suspicious launches and enriches them with venue-specific context.

### Components

- EVM watchers
- Solana watchers
- venue adapters
- shared matcher
- evidence generator

### Design Rules

- raw venue data must be preserved
- matching must be explainable
- confidence scores must be accompanied by evidence
- automated detectors may propose decisions, but reviewer-confirmed state is authoritative for negative verdicts

## Bags Adapter

The first Solana venue adapter should target Bags.fm.

Responsibilities:

- ingest launches
- fetch creator/provider metadata
- compare against approved project and wallet sets
- emit `AUTHORIZED`, `PENDING_REVIEW`, or `UNKNOWN`
- create evidence bundles for reviewer confirmation

The Bags adapter is specified in:

- [BAGS-ADAPTER.md](/Users/swarnava/Documents/Projects/tethics/docs/BAGS-ADAPTER.md)

---

## Layer 4: Distribution And Verification

This layer exposes the product to users and integrators.

### Public Surfaces

- the web app, rooted in the trust model of `tethics.eth`
- project verification pages by slug and asset
- warning pages for unauthorized launches
- public feeds / APIs

### Internal Surfaces

- approver dashboard
- pending review queue
- report evidence viewer
- project management dashboard

### Query Types

- verify by slug + asset
- reverse lookup by asset
- list project authorized assets
- list active unauthorized reports

---

## Target Repo Shape

```text
contracts/         EVM contracts
solana/            Solana attestation tooling and later program
watchers/evm/      EVM watchers
watchers/solana/   Solana venue watchers
frontend/          Web app
shared/            Shared schemas and normalization
docs/              Product, architecture, and integration docs
```

The current repo is not yet organized this way, but future work should move toward it.

---

## Source Of Truth Model

## Authoritative

- EVM contract state and events for EVM projects and assets
- Solana program state and events for Solana projects and assets
- explicit reviewer actions on the relevant chain

## Indexed / Derived

- search indexes
- normalized venue launch objects
- confidence scores
- verification page caches

Derived data may speed up the product, but it must not silently override authoritative records.

---

## Verification Semantics

Every verification surface should use the same status model:

- `AUTHORIZED`
- `UNAUTHORIZED`
- `PENDING_REVIEW`
- `UNKNOWN`
- `REVOKED`

### Meanings

- `AUTHORIZED`
  Positive authorization exists
- `UNAUTHORIZED`
  A reviewer or authoritative source has explicitly disavowed the asset
- `PENDING_REVIEW`
  Strong suspicious evidence exists but final review is not complete
- `UNKNOWN`
  No authoritative positive or negative record exists
- `REVOKED`
  Prior authorization was explicitly withdrawn

This vocabulary should be reused everywhere: contracts, JSON feeds, frontend badges, and reviewer tools.

---

## Security And Product Constraints

1. Early correctness is more important than premature decentralization.
2. Negative verdicts must be transparent and reviewable.
3. Venue metadata is useful evidence, not unquestionable truth.
4. Solana support should optimize for speed of credible disavowal.
5. Onchain storage should hold core state, not every piece of evidence.

---

## Current Implementation Gap

The current implementation in this repository is still mostly:

- EVM-first
- Base-focused
- contract-centric

The target architecture extends that model by adding:

- Solana founder identities
- Bags launch detection
- signed attestation records
- unified verification semantics
- reviewer-oriented moderation workflows

Use this document as the target architecture for the next implementation phase.

---

## Related Docs

- [PROJECT-PLAN.md](/Users/swarnava/Documents/Projects/tethics/docs/PROJECT-PLAN.md)
- [SCHEMA.md](/Users/swarnava/Documents/Projects/tethics/docs/SCHEMA.md)
- [SOLANA-MVP.md](/Users/swarnava/Documents/Projects/tethics/docs/SOLANA-MVP.md)
- [BAGS-ADAPTER.md](/Users/swarnava/Documents/Projects/tethics/docs/BAGS-ADAPTER.md)
- [THREAT-MODEL.md](/Users/swarnava/Documents/Projects/tethics/docs/THREAT-MODEL.md)
