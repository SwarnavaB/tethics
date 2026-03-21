# Solana MVP Spec

## Purpose

Define the first production-credible Solana release for `tethics`.

This document now assumes:

- Solana projects are governed by a native Solana program
- Solana approvals are not routed through EVM review transactions
- `tethics.sol` or `swarnava.sol` may be the initial public curator identity, but authority itself is represented by Solana-native signer control

The MVP is still curated first, but it should be architecturally correct from day one.

## MVP Outcome

The Solana MVP should let the product answer these questions from Solana-native state:

- Is this project approved on Solana?
- Is this mint official for that project?
- Is this creator wallet or launch wallet approved?
- Has this mint or creator been explicitly disavowed?
- Who approved or revoked the record?

## Scope

The MVP should support:

- Solana founder proposals
- Solana-native approver review
- authorized mint records
- authorized launch-wallet / creator records
- unwanted mint and creator records
- public review timeline
- delegation of approver roles
- Bags.fm-aware asset and creator identity coverage

The MVP does not need to support:

- fully decentralized governance
- automatic venue takedowns
- seizure or drain mechanics
- complex reputation scoring on Solana in v1

## Bootstrap Trust Model

Initial trust root:

- the Solana authority designated during bootstrap from the `tethics.eth` governance root

Initial practical identity:

- the wallet behind `tethics.sol` and/or `swarnava.sol`

Important distinction:

- the SNS name is the public identity
- the Solana signer is the actual authority

## Program Responsibilities

The Solana program should own:

- proposal state
- project approval state
- approver role state
- authorized asset state
- unwanted asset state
- revocation state
- review artifact references

The program should not depend on any offchain database for authoritative review state.

## Program Accounts

### 1. Global Config

Stores global program authority.

Fields:

- `version`
- `root_authority`
- `paused`
- `created_at`
- `updated_at`

Responsibilities:

- add and remove approvers
- rotate root authority
- set emergency pause for mutating instructions if needed

### 2. Approver Role Account

One per approver.

Fields:

- `approver`
- `role`
- `delegated_by`
- `created_at`
- `revoked_at`
- `active`

Roles:

- `ROOT_ADMIN`
- `APPROVER`
- `REPORTER`

### 3. Project Account

One per canonical project slug.

Fields:

- `slug`
- `display_name`
- `status`
- `primary_founder_wallet`
- `metadata_hash`
- `metadata_uri`
- `created_at`
- `updated_at`
- `approved_at`
- `approved_by`

Statuses:

- `PENDING_REVIEW`
- `APPROVED`
- `REJECTED`
- `SUSPENDED`

### 4. Proposal Account

One per founder proposal submission.

Fields:

- `proposal_id`
- `slug`
- `submitted_by`
- `metadata_hash`
- `metadata_uri`
- `submitted_at`
- `status`
- `reviewed_by`
- `reviewed_at`
- `resolution_hash`
- `resolution_uri`

Statuses:

- `PENDING`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

### 5. Asset Record Account

One per project + asset type + asset id.

Fields:

- `slug`
- `ecosystem`
- `asset_type`
- `asset_id`
- `status`
- `metadata_hash`
- `metadata_uri`
- `actor`
- `created_at`
- `updated_at`

Asset types for the Solana MVP:

- `MINT`
- `CREATOR_WALLET`
- `LAUNCH_WALLET`
- `SNS_NAME`

Statuses:

- `AUTHORIZED`
- `UNWANTED`
- `REVOKED`

### 6. Review Record Account

Optional in v1 if event logs plus fields on proposal and asset accounts are sufficient.

If used, it should store:

- review target
- decision
- actor
- evidence hash
- evidence uri
- timestamp

## Instructions

### Governance

- `initialize(root_authority)`
- `rotate_root_authority(new_root_authority)`
- `grant_role(account, role)`
- `revoke_role(account, role)`
- `set_pause(paused)`

### Founder Proposal Flow

- `submit_project_proposal(slug, display_name, metadata_hash, metadata_uri)`
- `cancel_project_proposal(proposal_id)`

### Project Review

- `approve_project_proposal(proposal_id, resolution_hash, resolution_uri)`
- `reject_project_proposal(proposal_id, resolution_hash, resolution_uri)`
- `suspend_project(slug, resolution_hash, resolution_uri)`

### Asset Management

- `authorize_asset(slug, asset_type, asset_id, metadata_hash, metadata_uri)`
- `mark_unwanted_asset(slug, asset_type, asset_id, metadata_hash, metadata_uri)`
- `revoke_asset(slug, asset_type, asset_id, metadata_hash, metadata_uri)`

### Optional Reporting Path

- `submit_report(slug, asset_type, asset_id, metadata_hash, metadata_uri)`

This can remain lower priority if approvers directly mark unwanted assets in v1.

## PDA Strategy

Recommended deterministic account keys:

- global config PDA by fixed seed
- approver PDA by `["approver", approver_pubkey]`
- project PDA by `["project", slug]`
- proposal PDA by `["proposal", proposer_pubkey, proposal_nonce]`
- asset PDA by `["asset", slug, asset_type, asset_id]`

Rules:

- all slug inputs must be normalized before derivation
- asset ids must be canonicalized before derivation
- names should be ASCII normalized in the same way the shared schema expects

## Artifact Model

The browser should still build canonical JSON artifacts and upload them publicly.

For Solana proposals and reviews, the program stores:

- `metadata_hash`
- `metadata_uri`
- `resolution_hash`
- `resolution_uri`

The full evidence stays offchain but publicly verifiable.

## Founder Flow

1. Founder connects Solana wallet.
2. Founder fills project proposal form.
3. Browser builds canonical proposal artifact.
4. Founder optionally signs an additional message proof in-browser.
5. Browser uploads artifact to IPFS/Arweave.
6. Founder submits `submit_project_proposal(...)` on Solana.
7. UI tracks proposal state directly from Solana.

If the project also has EVM assets, that is represented by the shared project slug and linked proofs, not by routing Solana approval through EVM.

## Reviewer Flow

1. Reviewer connects Solana admin wallet.
2. UI loads pending Solana proposals.
3. Reviewer opens the public artifact and supporting evidence.
4. Reviewer approves or rejects on Solana.
5. Reviewer manages Solana assets directly:
   - authorize mint
   - authorize creator wallet
   - mark unwanted mint
   - mark unwanted creator
   - revoke asset

## Verification Semantics

For Solana verification:

- `AUTHORIZED`
  an active authorized asset record exists
- `UNWANTED`
  an active unwanted asset record exists
- `REVOKED`
  a prior authorized asset was revoked
- `PENDING_REVIEW`
  project or asset proposal exists but no final decision exists
- `UNKNOWN`
  no authoritative Solana record exists

The UI may still surface detector evidence from Bags, but Bags evidence does not override Solana program state.

## Bags-Specific Requirements

Bags support in the Solana MVP should include:

- creator wallet as first-class asset type
- launch wallet as first-class asset type where distinguishable
- evidence bundle fields for:
  - venue
  - creator identity
  - provider or handle where available
  - token name / symbol
  - launch timestamp

The reviewer should be able to mark either:

- the mint as official
- the creator wallet as official
- the mint as unwanted
- the creator wallet as unwanted

This matters because a project may be impersonated repeatedly by the same unwanted creator identity.

## Security Requirements

### Required Before Mainnet

- external Solana program audit
- explicit authority rotation procedure
- multisig or equivalent for root authority
- reviewed PDA derivation and account validation rules
- replay resistance for proposal submission if signatures are used

### Required In Program Design

- signer validation on every mutating instruction
- explicit role checks
- explicit status-machine checks
- explicit duplicate-asset prevention
- explicit slug normalization rules
- no silent overwrites of approved or unwanted asset records

## UI Implications

The frontend must stop representing Solana approval as an EVM external-claim review flow.

The production UI should instead provide:

- Solana founder proposal submission against the Solana program
- Solana admin review queue sourced from Solana state
- Solana asset management sourced from Solana state
- unified project verification that merges:
  - EVM asset records from the EVM registry
  - Solana asset records from the Solana program

## Implementation Order

1. Define the Anchor account layout and instruction set.
2. Implement the Solana program.
3. Add frontend Solana RPC readers and transaction writers.
4. Refactor current Solana proposal UI away from `submitExternalClaim(...)`.
5. Keep signed curator artifacts only as supporting mirrors, not the authoritative layer.
