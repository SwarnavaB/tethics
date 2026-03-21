# Shared Schema

## Purpose

This document defines the canonical data model for tethics across:

- EVM
- Solana
- launch venue adapters
- frontend verification pages
- review and moderation tools
- public APIs and feeds

The main design goal is to keep one shared product model even when the underlying source of truth differs by ecosystem.

---

## Design Principles

1. One canonical project record per project slug.
2. Chain-specific assets and proofs hang off the same project record.
3. Governance is chain-native even when the project spans multiple ecosystems.
4. Authorization is always contextual.
   A token is not just "authorized" in the abstract. It is authorized for a project, on a chain, optionally through a venue, by a specific founder or approved wallet.
5. Detection evidence is preserved separately from the final verdict.
6. Wanted and unwanted assets must both be representable on every supported ecosystem.
7. Review status is explicit.
   Do not collapse `unknown`, `pending`, and `unauthorized` into one state.

---

## Canonical Enums

```ts
export type Ecosystem = 'EVM' | 'SOLANA';

export type ChainId =
  | 'ethereum'
  | 'base'
  | 'base-sepolia'
  | 'solana'
  | 'solana-devnet';

export type Venue =
  | 'BAGS'
  | 'PUMP_FUN'
  | 'UNISWAP_V2'
  | 'UNISWAP_V3'
  | 'AERODROME'
  | 'DIRECT'
  | 'OTHER';

export type ProjectStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export type AuthorizationStatus =
  | 'AUTHORIZED'
  | 'UNAUTHORIZED'
  | 'UNKNOWN'
  | 'PENDING_REVIEW'
  | 'REVOKED';

export type ProofType =
  | 'EVM_WALLET_SIG'
  | 'SOLANA_WALLET_SIG'
  | 'ENS'
  | 'SNS'
  | 'DNS_TXT'
  | 'GITHUB'
  | 'CONTRACT_OWNER'
  | 'PROGRAM_AUTHORITY'
  | 'VENUE_IDENTITY';

export type ProofStatus =
  | 'SUBMITTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type ReviewDecision =
  | 'APPROVE'
  | 'REJECT'
  | 'MARK_AUTHORIZED'
  | 'MARK_UNAUTHORIZED'
  | 'REQUEST_MORE_INFO'
  | 'REVOKE_AUTHORIZATION';

export type ReportSeverity =
  | 'INFO'
  | 'WARNING'
  | 'HIGH';
```

---

## Project Model

`Project` is the canonical top-level object.

```ts
export interface Project {
  id: string;                     // stable UUID or deterministic ID
  slug: string;                   // canonical normalized key, e.g. "uniswap"
  displayName: string;            // e.g. "Uniswap"
  description?: string;
  website?: string;
  socials: ProjectSocials;
  status: ProjectStatus;
  createdAt: string;              // ISO timestamp
  updatedAt: string;              // ISO timestamp
  approvedAt?: string;
  approvedBy?: IdentityRef[];
  authorityProfiles: AuthorityProfile[];
  founderIdentities: FounderIdentity[];
  proofs: ProjectProof[];
  chainProfiles: ChainProfile[];
  policy: ProjectPolicy;
  tags?: string[];
}
```

```ts
export interface IdentityRef {
  id: string;
  address?: string;
  label?: string;
}

export interface ReviewerRef {
  id: string;
  address?: string;
  role?: 'CURATOR' | 'APPROVER' | 'REPORTER';
}

export interface ReporterRef {
  id: string;
  address?: string;
  source?: 'SYSTEM' | 'COMMUNITY' | 'CURATOR';
}

export interface AuthorityProfile {
  ecosystem: Ecosystem;
  chain: ChainId;
  authorityAddress: string;
  role: 'ROOT_ADMIN' | 'APPROVER' | 'REPORTER';
  delegatedBy?: string;
  activatedAt: string;
  revokedAt?: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  displayName: string;
  status: ProjectStatus;
}

export interface ProjectPolicy {
  autoAuthorizeLaunchWalletMints?: boolean;
  requireManualReviewForVenueMismatch?: boolean;
  allowedVenues?: Venue[];
}
```

### Rules

- `slug` is globally unique across the product.
- `displayName` is presentation-only.
- `slug` should be ASCII lowercase with hyphens and digits only.
- `status=APPROVED` means the project may appear in public verification results.

---

## Socials

```ts
export interface ProjectSocials {
  x?: string;
  github?: string;
  discord?: string;
  telegram?: string;
  farcaster?: string;
  ens?: string;
  sns?: string;
}
```

These are not sufficient proof on their own unless linked to a proof object.

---

## Founder Identity

`FounderIdentity` represents an approved identity root connected to the project.

```ts
export interface FounderIdentity {
  id: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  address: string;                // hex for EVM, base58 for Solana
  label?: string;                 // "primary deployer", "treasury", "founder wallet"
  isPrimary: boolean;
  verifiedAt?: string;
  proofIds: string[];
}
```

### Rules

- Each approved project should have at least one primary identity.
- An identity can exist before approval, but is not authoritative until the project is approved.
- The same project may have multiple EVM and Solana identities.
- Project approval authority on EVM and Solana may come from different chain-native role holders.

---

## Proof Model

```ts
export interface ProjectProof {
  id: string;
  projectId: string;
  type: ProofType;
  ecosystem?: Ecosystem;
  chain?: ChainId;
  submittedBy: string;            // wallet or reviewer ID
  submittedAt: string;
  status: ProofStatus;
  verifierNotes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  payload: ProofPayload;
  anchors: ProofAnchor[];
}
```

```ts
export type ProofPayload =
  | EvmWalletSigProof
  | SolanaWalletSigProof
  | EnsProof
  | SnsProof
  | DnsTxtProof
  | GithubProof
  | ContractOwnerProof
  | ProgramAuthorityProof
  | VenueIdentityProof;
```

### Example Payloads

```ts
export interface EvmWalletSigProof {
  type: 'EVM_WALLET_SIG';
  address: string;
  message: string;
  signature: string;
}

export interface SolanaWalletSigProof {
  type: 'SOLANA_WALLET_SIG';
  address: string;
  message: string;
  signature: string;              // base58 or bytes encoded
}

export interface EnsProof {
  type: 'ENS';
  name: string;
  resolvedAddress?: string;
}

export interface SnsProof {
  type: 'SNS';
  name: string;
  resolvedAddress?: string;
}

export interface VenueIdentityProof {
  type: 'VENUE_IDENTITY';
  venue: Venue;
  handle?: string;
  wallet?: string;
  externalId?: string;
  evidenceUrl?: string;
}
```

```ts
export interface ProofAnchor {
  kind: 'HASH' | 'URL' | 'TX' | 'ACCOUNT';
  value: string;
  chain?: ChainId;
}
```

### Proof Policy

For approval, require:

- at least 2 proofs
- at least 2 distinct proof categories
- at least 1 wallet signature proof
- at least 1 proof that is independent of the signing wallet

Recommended independent second proof:

- ENS or SNS
- DNS
- GitHub
- existing contract/program authority

---

## Chain Profile

`ChainProfile` stores chain-local configuration for a project.

```ts
export interface ChainProfile {
  id: string;
  projectId: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  status: ProjectStatus;
  launchWallets: LaunchWallet[];
  authorizedAssets: AuthorizedAsset[];
  venueProfiles: VenueProfile[];
}
```

---

## Launch Wallet

A launch wallet is important because many venues expose launcher or creator wallets before a mint is reviewed manually.

```ts
export interface LaunchWallet {
  id: string;
  address: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  label?: string;
  status: AuthorizationStatus;    // usually AUTHORIZED or REVOKED
  validFrom?: string;
  validUntil?: string;
  notes?: string;
}
```

### Use Cases

- pre-authorize a Solana wallet that will launch on Bags
- pre-authorize an EVM deployer wallet
- temporarily approve a campaign-specific launch wallet

---

## Venue Profile

Venue-level authorization is needed for Bags and similar products.

```ts
export interface VenueProfile {
  id: string;
  venue: Venue;
  ecosystem: Ecosystem;
  chain: ChainId;
  status: AuthorizationStatus;
  handles?: string[];
  creatorWallets?: string[];
  metadata?: Record<string, string>;
}
```

### Bags Example

```ts
const bagsProfile: VenueProfile = {
  id: 'vp_123',
  venue: 'BAGS',
  ecosystem: 'SOLANA',
  chain: 'solana',
  status: 'AUTHORIZED',
  creatorWallets: ['<base58 wallet>'],
  handles: ['project_handle'],
};
```

---

## Authorized Asset

`AuthorizedAsset` is the object integrators care about most.

```ts
export interface AuthorizedAsset {
  id: string;
  projectId: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  venue?: Venue;
  status: AuthorizationStatus;
  assetType: 'TOKEN' | 'MINT' | 'LP' | 'DEPLOYER';
  address: string;                // contract address or mint address
  symbol?: string;
  name?: string;
  decimals?: number;
  launchWallet?: string;
  creatorWallet?: string;
  authorizedAt?: string;
  authorizedBy?: string[];
  revokedAt?: string;
  metadata?: Record<string, string>;
}
```

### Rules

- `AUTHORIZED` means public clients should show a positive verification result.
- `REVOKED` means the asset used to be authorized but is no longer.
- `UNKNOWN` is not stored for canonical assets; it is computed at query time when no matching authorized or unauthorized record exists.

---

## Unauthorized Report

`UnauthorizedReport` stores venue-specific detection evidence and review outcomes.

```ts
export interface UnauthorizedReport {
  id: string;
  projectId?: string;
  slugHint?: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  venue?: Venue;
  assetAddress: string;           // token contract or mint
  launchWallet?: string;
  creatorWallet?: string;
  detectedAt: string;
  detectedBy: ReporterRef;
  confidence: number;             // 0-100
  severity: ReportSeverity;
  status: AuthorizationStatus;    // PENDING_REVIEW, UNAUTHORIZED, AUTHORIZED
  evidence: LaunchEvidence[];
  reviewerNotes?: string;
  decidedAt?: string;
  decidedBy?: string;
}
```

### Rules

- `status=PENDING_REVIEW` means the report is visible to reviewers but should not be presented as definitive to users.
- `status=UNAUTHORIZED` means the frontend can show a red warning page.
- `status=AUTHORIZED` on a report means the detector flagged something that reviewers later cleared.

---

## Evidence Model

Evidence should be additive and venue-specific.

```ts
export interface LaunchEvidence {
  id: string;
  type:
    | 'NAME_MATCH'
    | 'SYMBOL_MATCH'
    | 'WALLET_MATCH'
    | 'WALLET_MISMATCH'
    | 'VENUE_CREATOR_MATCH'
    | 'VENUE_CREATOR_MISMATCH'
    | 'SOCIAL_MATCH'
    | 'SOCIAL_MISMATCH'
    | 'DOMAIN_MATCH'
    | 'MANUAL_NOTE';
  summary: string;
  weight: number;                 // -100 to +100
  source: EvidenceSource;
  payload?: Record<string, string>;
}
```

```ts
export interface EvidenceSource {
  kind: 'ONCHAIN' | 'VENUE_API' | 'PROJECT_SUBMISSION' | 'MANUAL_REVIEW';
  label: string;
  url?: string;
  chain?: ChainId;
  txHash?: string;
  account?: string;
}
```

### Example

```ts
const evidence: LaunchEvidence = {
  id: 'ev_1',
  type: 'VENUE_CREATOR_MISMATCH',
  summary: 'Bags creator wallet is not in the project approved wallet set',
  weight: -40,
  source: {
    kind: 'VENUE_API',
    label: 'Bags API',
    url: 'https://docs.bags.fm/api-reference',
  },
};
```

---

## Review Objects

Every moderation action should be explicit and auditable.

```ts
export interface ReviewAction {
  id: string;
  targetType: 'PROJECT' | 'PROOF' | 'ASSET' | 'REPORT';
  targetId: string;
  decision: ReviewDecision;
  actor: ReviewerRef;
  reason?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}
```

---

## Query Shapes

### Verify By Slug + Asset

```ts
export interface VerifyRequest {
  slug: string;
  chain: ChainId;
  assetAddress: string;
}

export interface VerifyResponse {
  slug: string;
  chain: ChainId;
  assetAddress: string;
  status: AuthorizationStatus;
  project?: ProjectSummary;
  authorizedAsset?: AuthorizedAsset;
  activeReport?: UnauthorizedReport;
}
```

### Verify By Mint / Contract Only

```ts
export interface ReverseLookupResponse {
  chain: ChainId;
  assetAddress: string;
  matchedProjects: ProjectSummary[];
  authorizedFor?: string;
  activeReports: UnauthorizedReport[];
}
```

---

## Normalization Rules

### Slug

- lowercase only
- ASCII only
- trim whitespace
- spaces become `-`
- collapse repeated separators

### EVM Address

- store checksum form when possible
- compare case-insensitively

### Solana Address

- store canonical base58
- reject invalid public keys at ingestion time

### Symbol And Name Matching

Store raw values and normalized forms separately:

```ts
export interface AssetNameView {
  rawName?: string;
  rawSymbol?: string;
  normalizedName?: string;
  normalizedSymbol?: string;
}
```

Never overwrite the raw onchain or venue value.

---

## Storage Guidance

### Onchain / Signed Source Of Truth

- EVM authorization state
- Solana signed attestations or registry-program records
- approval/revocation events

### Indexed / Offchain

- evidence bundles
- venue metadata snapshots
- search indexes
- reviewer notes
- cached verification pages

Do not attempt to store all evidence details onchain.

---

## MVP Subset

For the first cross-chain release, the minimum required objects are:

- `Project`
- `FounderIdentity`
- `ProjectProof`
- `ChainProfile`
- `LaunchWallet`
- `VenueProfile`
- `AuthorizedAsset`
- `UnauthorizedReport`
- `LaunchEvidence`

If implementation pressure is high, defer:

- reviewer reputation
- advanced policy metadata
- generalized social identity graph
