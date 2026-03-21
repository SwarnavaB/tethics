# Project Plan

## Goal

Finish tethics as a cross-ecosystem authenticity layer for project founders, with first-class support for:

- EVM tokens and launch venues
- Solana tokens, especially Bags.fm launches
- Initial curation by the operator of `tethics.eth` and `tethics.sol`
- Gradual delegation to trusted community approvers and reporters

The product should answer one question quickly and credibly:

> Did the real project founder authorize this token launch on this chain and venue?

That answer needs to be available to humans, wallets, launch tools, bots, and block explorers.

---

## Why The Strategy Needs To Change

The current repo is directionally right, but it is still biased toward a single-chain EVM flow and a punitive "charity drain" mechanism. That is not enough for the actual threat surface.

The most important missing realities are:

- Many impersonation launches now happen on Solana rather than EVM
- A meaningful share of those launches happen through Bags.fm
- Venue-specific attribution data matters as much as token metadata
- Solana does not offer the same mechanical recovery/drain pattern as an EVM Shield contract
- The highest-value product surface is often early detection and public disavowal, not post-launch fund routing

That means tethics should be framed as a verification and distribution network first, and an economic-defense mechanism second.

---

## Product Principles

1. **One canonical project identity**
   Each project gets one normalized slug, with chain-specific addresses and social proofs attached.

2. **Founders opt in once**
   Founders should not need to babysit the system after setup.

3. **Venue-aware verification**
   The system must reason about tokens in context: chain, launcher, creator/deployer, and linked socials.

4. **Public yes/no answers**
   Integrators need a fast machine-readable authorization answer, not a long case file.

5. **Curated first, decentralized later**
   The wallet controlling `tethics.eth` should bootstrap governance, designate the initial Solana curator authority, and later delegate approvers, reporters, and governance rights on each chain.

6. **No hard dependency on a single platform**
   Bags is the first Solana venue to support well, not the only one.

7. **Static frontend where possible, optional infra where necessary**
   Onchain data remains the source of truth. Offchain services are allowed only where they materially improve detection, indexing, and distribution.

---

## Product Scope

### Core Outcome

tethics should provide:

- project registration and verification
- authorization of official token launches
- disavowal of unauthorized launches
- public verification pages
- machine-readable APIs and event feeds
- watcher-based detection for launch venues
- curated review and challenge flows

### What Counts As "Protection"

Protection should be defined broadly:

- founders can prove ownership of a project identity
- users can verify whether a token is authorized
- watchers can detect likely impersonation launches quickly
- the frontend can publish a clear warning page for unauthorized launches
- venue-specific evidence can be attached to each unauthorized report
- on EVM, optional Shield mechanics can continue as an economic deterrent

On Solana, the main defense is signal distribution and reputational suppression, not forced fund routing.

---

## Target Architecture

## Layer A: Identity And Verification

Create a cross-chain project registry model with:

- canonical project slug
- display name
- founder identities
- linked addresses per ecosystem
- proof set
- approver status
- registration status
- per-chain authorized token list

### Founder Identity Model

Support multiple proof classes:

- EVM wallet signature
- ENS ownership or resolution
- Solana wallet signature
- SNS `.sol` ownership or resolution
- DNS TXT proof
- GitHub or signed repository proof
- existing contract/program ownership proof
- launch-platform identity linkage where available

### Recommendation

Use Ethereum and Solana as peer identity roots rather than trying to make one chain fully subordinate to the other. A project can register with either:

- EVM-first proofs
- Solana-first proofs
- both

The registry should still force at least two independent proofs.

---

## Layer B: Chain-Specific Authorization

### EVM

Keep the EVM Registry/Shield model, but narrow v1 scope:

- Registry remains the source of truth for project registration and authorized token contracts
- Shield remains optional and should be treated as an enhancement, not the core product
- focus on reliable authorization state and integrations before optimizing charity-routing mechanics

### Solana

Add a Solana registry program that supports:

- project registration
- approver approval
- authorized mint records
- unauthorized launch reports with evidence
- links to Bags launch creator data and project proofs

Signed attestations may still be produced as public mirrors, but authoritative Solana approval state should live in the Solana program itself.

---

## Layer C: Detection

Detection should become a first-class subsystem with pluggable adapters.

### Bags Adapter

Build the first Solana detector specifically for Bags.fm.

The adapter should:

- ingest new token launches from Bags-related sources
- fetch launch creator metadata from Bags
- compare creator wallets, usernames, socials, and token metadata against registered projects
- classify a launch as `authorized`, `unknown`, `likely unauthorized`, or `unauthorized`
- emit evidence that can be surfaced in the frontend and sent to reviewers/reporters

### Why Bags Is Actionable

Based on the Bags docs, Bags exposes:

- token launch creation and metadata APIs
- token creator/deployer lookup
- creator/provider identity fields

That means tethics can use Bags-specific evidence instead of relying only on fuzzy name matching.

### Detection Confidence Model

Each report should carry a confidence score with reasons, for example:

- exact project slug match in name or symbol
- matching founder wallet
- matching SNS or ENS-linked identity
- Bags creator wallet mismatch
- Bags provider username mismatch
- known impersonation keywords or ticker collisions

---

## Layer D: Distribution

tethics only works if warnings get seen.

Ship multiple distribution surfaces:

- web verification pages at `tethics.eth` and `tethics.sol`
- shareable unauthorized-launch pages
- JSON feed / API for wallets and explorers
- webhook-style feed for community bots
- optional browser extension or lightweight embeddable widget

For Solana, the public warning page matters more than the onchain state alone.

---

## Governance Model

## Phase 1: Curated

Initial authority should be bootstrapped by the wallet controlling:

- `tethics.eth`

That EVM governance root should then designate:

- the initial Solana authority for Solana-native governance

Responsibilities:

- approve registrations
- reject weak or malicious submissions
- seed the initial protected project set
- curate trusted reporters and approvers on each ecosystem

## Phase 2: Delegated

Add:

- approver roles
- reviewer reputation
- reporter reputation
- transparent audit log for approvals and rejections

## Phase 3: Community-Governed

Move toward:

- multi-approver thresholds
- published approval policy
- public challenge workflow
- eventual DAO, council, or multisig if genuinely useful

Do not decentralize early at the expense of correctness. False approvals are worse than temporary centralization.

---

## Recommended Roadmap

## Phase 0: Product Reset And Documentation

Objective: align the repo with the actual product.

Deliverables:

- update project narrative from "charity drain utility" to "cross-chain token authorization and disavowal network"
- define chain/venue abstraction model
- define Solana MVP boundaries
- define Bags adapter scope
- define approval policy for founder onboarding

Success criteria:

- clear architecture doc
- clear product roadmap
- explicit MVP vs later-phase features

## Phase 1: Ship A Useful EVM Core

Objective: make the current EVM implementation production-credible.

Deliverables:

- harden `Registry`
- simplify or postpone risky Shield functionality that is not ready
- deploy on Base
- complete frontend flows for registration, verification, approval queue, and dashboard
- finalize event schema and API surface for integrators

Required work:

- resolve implementation gaps between docs and contracts
- add deploy scripts and real addresses
- finish frontend read/write flows
- add end-to-end tests for approval, challenge, authorization, revocation, and reporting
- publish ABI and integration examples

Success criteria:

- real projects can register
- reviewers can approve safely
- wallets/frontends can query authorization state on Base

## Phase 2: Solana MVP With Bags Support

Objective: ship practical founder protection on Solana as fast as possible.

Deliverables:

- Solana project registration format
- Solana founder proof flow
- Bags launch detector
- unauthorized launch evidence model
- public verification and warning pages for Solana mints

Required work:

- create Solana workspace in repo
- implement signed-attestation registry or minimal Solana program
- add SNS proof support
- add Solana wallet connect in frontend
- build Bags watcher service/CLI
- add data model for creator/deployer/provider metadata
- add Solana verify route: `#/verify/solana/<mint>`

Success criteria:

- tethics can say whether a Solana mint is authorized for a protected project
- Bags launches can be classified with venue-aware evidence
- founders can publicly disavow unauthorized Bags launches quickly

## Phase 3: Unified Cross-Chain Registry UX

Objective: make the system feel like one product, not two stitched systems.

Deliverables:

- project page showing EVM + Solana identity
- shared slug and proof bundle
- chain-specific authorized assets list
- one verification API surface with chain parameter

Success criteria:

- integrators query one product model
- founders manage both ecosystems from one dashboard

## Phase 4: Distribution And Integrations

Objective: get the signal in front of users.

Deliverables:

- public API / feed
- wallet integration examples
- block explorer integration guide
- Telegram/X/Discord bot hooks
- embeddable verification badge

Success criteria:

- third parties can consume tethics without custom support from you

## Phase 5: Community Takeover

Objective: reduce key-person risk.

Deliverables:

- approver policy
- reporter policy
- dispute policy
- role delegation tools
- transparent public governance logs

Success criteria:

- approvals and disputes no longer depend only on you

---

## Bags-Focused MVP Plan

This is the highest-priority tactical plan.

## Founder Flow

1. Founder claims a project on tethics with:
   - project slug
   - display name
   - Solana wallet
   - optional EVM wallet
   - SNS or ENS
   - website and social proofs
2. Curator approves the project.
3. Founder optionally pre-registers:
   - official Solana launch wallet(s)
   - official EVM deployer wallet(s)
   - expected token name/symbol
   - official Bags creator wallet if they intend to use Bags
4. When the founder launches, they authorize the mint after deployment or pre-authorize the launch wallet.

## Unauthorized Bags Launch Flow

1. Watcher detects a new Bags launch.
2. Bags adapter fetches launch creators and provider metadata.
3. Matcher compares the launch against protected projects.
4. If there is a strong match but creator wallet is not authorized:
   - create an unauthorized report
   - attach evidence
   - publish the warning page
   - optionally notify the founder and curator
5. Curator or delegated reviewer confirms or overturns the classification.

## Authorized Bags Launch Flow

1. Founder launches with a pre-authorized Bags wallet or creator identity.
2. Watcher detects the launch.
3. System marks it authorized automatically or queues it for lightweight review.
4. Verification page shows:
   - project
   - mint
   - creator wallet
   - Bags provider identity
   - authorization status

---

## Technical Repo Plan

Restructure the repo into explicit product areas:

- `contracts/`
  EVM contracts
- `solana/`
  Solana program or signed-attestation tooling
- `watchers/evm/`
  EVM venue watchers
- `watchers/solana/`
  Solana venue watchers, starting with Bags
- `frontend/`
  unified web app
- `shared/`
  shared schemas, slug normalization, evidence types, chain enums
- `docs/`
  product and architecture docs

### Shared Types To Introduce

- `Project`
- `FounderIdentity`
- `ProjectProof`
- `AuthorizedAsset`
- `UnauthorizedReport`
- `LaunchEvidence`
- `VenueAdapter`

### Shared Enums

- `ecosystem = EVM | SOLANA`
- `authorizationStatus = AUTHORIZED | UNAUTHORIZED | UNKNOWN | PENDING_REVIEW`
- `venue = BAGS | PUMP_FUN | UNISWAP | AERODROME | OTHER`

---

## Detailed Workstreams

## Workstream 1: Product And Policy

- write registration policy
- write approval policy
- write rejection policy
- define what counts as sufficient proof
- define when a project can reserve a name across ecosystems
- define how disputes work across EVM and Solana identities

## Workstream 2: EVM Hardening

- audit `Registry` logic and events
- reduce or defer incomplete Shield behavior
- fix deterministic deployment assumptions
- finish Base deployment flow
- add production config handling

## Workstream 3: Solana Registry

- choose MVP approach: signed attestations vs Anchor program
- implement Solana proof verification flow
- add SNS support
- add authorized mint / wallet model
- define report evidence schema

## Workstream 4: Bags Integration

- create Bags API client
- create launch ingestion pipeline
- fetch token creator data
- normalize provider identity data
- map Bags launches to project records
- score matches and expose evidence

## Workstream 5: Frontend

- support EVM + Solana wallets
- add project onboarding flow for both ecosystems
- add review queue UI for curator/approvers
- add verification pages for contracts and mints
- add public project pages with official links and assets

## Workstream 6: Data And Indexing

- add event indexing for EVM
- add Solana attestation indexing
- cache venue metadata when needed
- expose read API / JSON feed

## Workstream 7: Distribution

- add public feeds
- add notifications for founders
- publish integration examples
- add social posting templates for disavowals

---

## What To Build First

Recommended order:

1. finish the EVM registry product and remove ambiguity around what is production-ready
2. define the shared project/proof/evidence schema
3. build the Solana/Bags detection pipeline
4. ship Solana verification pages and signed attestations
5. only then decide whether a full Solana onchain registry program is justified

This ordering gets you to useful protection sooner.

---

## Success Metrics

Track:

- number of approved projects
- number of projects with both EVM and Solana identities linked
- detection latency from launch to warning
- percentage of Bags launches classified automatically
- false positive and false negative rates
- number of integrators consuming the verification feed
- number of delegated approvers and reporters

The most important metric early on is:

- time from unauthorized launch to public, shareable disavowal

---

## Open Questions

- Do you want Solana MVP to be onchain immediately, or is a signed-attestation layer acceptable for the first release?
- Should founder authorization be mint-based only, or also wallet-based and venue-based?
- Do you want tethics to actively notify venues like Bags, or remain purely a public signal layer?
- Is the charity-drain concept still central, or should it become an optional EVM-only module?
- Should project identity be global across ecosystems, or should each ecosystem require explicit opt-in under the same slug?

---

## Immediate Next Actions

1. Reframe the product docs around cross-chain authorization and disavowal.
2. Decide the Solana MVP implementation path.
3. Define the shared schema for project identity, proofs, authorized assets, and unauthorized reports.
4. Build the Bags adapter and watcher first among all Solana integrations.
5. Finish the Base deployment and reviewer workflow so you have one production-quality reference implementation.
