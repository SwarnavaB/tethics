# Production Architecture Plan

## Goal

Ship `tethics` as a production-grade public good with:

- chain-native governance for EVM and Solana
- one cross-chain project identity model
- project protection that spans both EVM and SOL assets
- `tethics.eth` as the initial bootstrap root of trust
- explicit future delegation to community reviewers and approvers
- no hidden backend state

The core product question remains:

> Did the legitimate project authorize this asset on this chain and venue?

But the execution model must now be:

- EVM projects are governed by EVM contracts
- Solana projects are governed by a Solana program
- the UI unifies both into one product surface

## Executive Summary

The previous bootstrap design used the EVM registry as a coordination layer for Solana claims. That is acceptable for a prototype, but not for true parity.

The production target should be:

1. `tethics.eth` controls the initial EVM governance root.
2. That governance root designates the initial Solana curator authority.
3. EVM approvals, revocations, and delegation happen on EVM.
4. Solana approvals, revocations, and delegation happen on Solana.
5. One project can own official and unwanted asset records across both ecosystems.
6. The UI is static and reads chain state directly, plus public artifact URIs.

## Governance Model

### Bootstrap Root

The initial root of trust should be the EVM wallet that controls `tethics.eth`.

That wallet should own:

- the EVM registry proxy admin
- the EVM registry owner role
- the authority to nominate the first Solana curator authority

This should not rely on a frontend-only ENS label check. It should be implemented by deploying the EVM contracts under the wallet that controls `tethics.eth`, then showing the verified admin identity in the UI.

### Solana Bootstrap Authority

Solana governance should be native to Solana.

The Solana program should have:

- `root_authority`
- `approver` role accounts
- optional `reporter` role accounts later

The initial `root_authority` can be the wallet that controls `tethics.sol` or `swarnava.sol`, but the important point is that it is a Solana-native authority, not an EVM contract pretending to be one.

### Delegation Model

Both ecosystems should support explicit role delegation.

Initial roles:

- `ROOT_ADMIN`
- `APPROVER`
- `REPORTER`

Later roles:

- `CHALLENGE_REVIEWER`
- `RISK_REVIEWER`
- `EMERGENCY_OPERATOR`

Delegation requirements:

- every role grant and revoke must be onchain
- roles should be scoped by ecosystem at minimum
- later phases may add project-scoped or venue-scoped roles
- all role changes must emit events

## Canonical Product Model

The product should be project-centric, not chain-centric.

One project record should contain:

- canonical slug
- display name
- approved founder identities
- approved admin identities
- official assets across EVM and SOL
- revoked assets across EVM and SOL
- reported unwanted assets across EVM and SOL
- proof and review history

The same project may therefore have:

- one official Base token
- one official Solana mint
- several approved launch wallets
- several approved creator identities
- several known impersonation assets on both ecosystems

## Chain-Native State Model

### EVM State

The EVM registry remains responsible for:

- project registration
- approver review
- EVM token authorization
- EVM token revocation
- EVM-side unwanted token reports
- EVM governance delegation

Optional:

- Shield deployment and enforcement mechanics

### Solana State

The Solana program should own:

- project proposal accounts
- project approval state
- approved founder wallet records
- approved mint records
- approved launch-wallet / creator-identity records
- revoked asset records
- unwanted mint / launch reports
- Solana governance delegation

The Solana program must emit enough event or account-state information for the UI to resolve:

- approved projects
- approved assets
- pending proposals
- rejected proposals
- revoked assets
- reviewer decisions

## Cross-Chain Linking

Projects can exist on both ecosystems at once.

That means the system needs explicit cross-chain linking without collapsing governance into one chain.

Recommended model:

- each ecosystem stores its own project authority and approval state
- both ecosystems reference the same normalized slug
- both ecosystems may optionally anchor the same content hash for proposal and review artifacts
- the UI merges records by slug, not by “which chain is primary”

Cross-chain linkage fields:

- canonical slug
- project display name
- EVM founder/admin wallets
- Solana founder/admin wallets
- ENS
- SNS
- website and social proofs
- artifact content hashes

## Asset Coverage

Protection must account for wanted and unwanted assets on both ecosystems.

For each project, the protocol should support:

- `AUTHORIZED_EVM_TOKEN`
- `AUTHORIZED_SOLANA_MINT`
- `AUTHORIZED_EVM_LAUNCHER`
- `AUTHORIZED_SOLANA_CREATOR`
- `AUTHORIZED_SOLANA_LAUNCH_WALLET`
- `REVOKED_*`
- `UNWANTED_*`

That allows the product to answer:

- “Is this official on Base?”
- “Is this official on Solana?”
- “Has this project disavowed this mint?”
- “Has this project disavowed this creator wallet?”
- “Has this project been impersonated on the other ecosystem?”

## UI Model

The UI should remain a single product surface, but with chain-native execution underneath.

### Founder Flow

1. Connect EVM wallet and/or Solana wallet.
2. Choose project scope:
   - EVM only
   - Solana only
   - Cross-chain
3. Submit proposal on the relevant chain(s).
4. Upload public evidence bundle from the browser.
5. Track approval state directly from the relevant chain.

### Reviewer Flow

1. Connect the chain-native admin wallet.
2. Open pending queue per ecosystem.
3. Inspect artifacts and proofs.
4. Approve or reject on the relevant chain.
5. Publish or anchor review artifact.
6. Manage role delegation if permitted.

### Public Verification

The verify page should be project-centric and show:

- EVM official assets
- Solana official assets
- EVM unwanted assets
- Solana unwanted assets
- project review timeline
- chain-native approval source
- artifact integrity verification

## Production Security Requirements

### Governance

- use multisig ownership for the `tethics.eth` EVM root before mainnet
- use a Solana multisig or well-defined program authority arrangement for the Solana root
- separate proxy admin control from day-to-day approver operations
- do not run production with a single hot key holding all authority

### Upgradeability

Upgradeable contracts are acceptable for reference coordination layers, but must be governed tightly.

Recommended:

- EVM registry: proxy
- EVM shield factory: proxy
- per-project shields: immutable
- Solana program: upgradeable only during the curated phase, with a published freeze / governance transition plan

### Emergency Controls

The production plan should include:

- emergency role revoke
- emergency asset revoke
- emergency review freeze for compromised approvers
- onchain pause only for governance mutation paths if absolutely necessary

Do not pause public verification reads.

### Key Management

- cold or hardware-backed keys for root roles
- separate signer sets for deployment, upgrade, and review
- explicit key rotation procedures
- public incident procedure for compromised approvers

### Audit

Required before mainnet:

- external EVM audit
- external Solana program audit
- browser artifact-signing and upload-flow review
- threat-model review for cross-chain spoofing and role escalation

## No-Backend Constraint

The production target still avoids a private backend.

Allowed:

- browser RPC reads
- browser wallet actions
- browser IPFS uploads
- public artifact gateways
- optional community-run watchers that publish evidence bundles

Not allowed as a source of truth:

- private moderation database
- hidden reviewer queue
- server-only approval logic

## Recommended Rollout

### Phase 0

- freeze the architecture around chain-native governance
- stop adding more Solana-through-EVM shortcuts
- finalize the cross-chain schema and role model

### Phase 1

- harden and deploy the EVM upgradeable registry stack
- bind bootstrap governance to the wallet controlling `tethics.eth`
- ship EVM admin and reviewer UX

### Phase 2

- build the Solana registry program
- deploy with a Solana-native bootstrap authority
- ship Solana proposal, approval, and asset management UX

### Phase 3

- unify the UI around cross-chain project pages
- support mixed projects with official and unwanted assets on both ecosystems
- expose project-wide timeline and public governance pages

### Phase 4

- introduce delegated community roles
- add challenge and appeal workflows
- move toward multisig or council-based governance on both chains

## Immediate Repo Work

1. Rewrite the architecture and UI specs around chain-native governance.
2. Extend the schema to distinguish:
   - chain-native authority records
   - cross-chain linked project records
   - wanted vs unwanted assets on both ecosystems
3. Specify the Solana program accounts and instruction set.
4. Refactor the frontend plan so Solana approvals are no longer modeled as EVM-reviewed external claims.
5. Define the bootstrap governance runbook for `tethics.eth` and delegated Solana authority.
