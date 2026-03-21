# Bags Adapter Spec

## Purpose

Define the first Solana launch-venue adapter for tethics.

This adapter should detect new Bags launches, enrich them with venue data, compare them against protected project records, and emit structured evidence for review and public verification.

This is the highest-priority detection integration for Solana MVP.

---

## Why Bags Gets First-Class Support

Bags is a major source of impersonation launches in the target threat model.

It is also one of the more actionable venues because its docs indicate the presence of:

- token launch APIs
- analytics endpoints
- creator-related metadata
- wallet-linked and provider-linked data

That gives tethics a better signal set than pure onchain mint scanning.

Reference docs:

- https://docs.bags.fm/api-reference
- https://docs.bags.fm/api-reference/get-token-launch-creators
- https://bags.fm/

---

## Adapter Responsibilities

The Bags adapter must:

- detect new Bags launches
- resolve core launch metadata
- fetch creator and provider identity data when available
- normalize launch data into shared tethics schema
- run a project matching pipeline
- score confidence
- emit either:
  - `AUTHORIZED`
  - `PENDING_REVIEW`
  - `UNKNOWN`
- create structured evidence bundles

It should not directly publish `UNAUTHORIZED` final verdicts without reviewer confirmation.

---

## Ingestion Sources

The adapter should support multiple source types.

## Source 1: Bags API

Use official Bags API endpoints when available for:

- launch metadata
- creator information
- claim stats / creator-linked analytics
- fee claimer or provider-linked information

Initial endpoints to target:

- `GET /token-launch/creator/v3`
- `GET /token-launch/claim-stats`
- fee-share wallet lookup endpoints when provider/username back-resolution is needed

Authentication should use the documented `x-api-key` header.

## Source 2: Solana Onchain Activity

Use Solana RPC or indexers for:

- mint creation
- launch wallet activity
- transaction signatures
- program/account links

## Source 3: Manual Reports

Allow curator or community reporters to submit:

- a mint address
- a Bags URL
- screenshots or notes

Manual reports should run through the same enrichment pipeline after submission.

---

## Normalized Launch Object

Every Bags event should be normalized into a canonical object before matching.

```ts
export interface BagsLaunch {
  id: string;
  venue: 'BAGS';
  chain: 'solana';
  detectedAt: string;
  mint: string;
  tokenName?: string;
  tokenSymbol?: string;
  creatorWallet?: string;
  launchWallet?: string;
  provider?: string;
  providerUsername?: string;
  url?: string;
  txHash?: string;
  metadata: Record<string, string>;
  raw: Record<string, unknown>;
}
```

### Field Notes

- `creatorWallet` is the most important positive or negative signal when present.
- `provider` and `providerUsername` should be stored raw and normalized.
- `raw` should preserve the original response shape for debugging and future migrations.

---

## Matching Pipeline

Matching should be deterministic and explainable.

## Step 1: Candidate Project Selection

Generate candidate projects using:

- exact slug match against normalized token name
- exact slug match against normalized symbol
- prefix/suffix match
- curated alias list
- manual project keyword list

This step should be generous.

## Step 2: Identity Comparison

For each candidate project, compare:

- creator wallet vs approved founder wallets
- creator wallet vs approved launch wallets
- provider username vs registered venue handles
- project website/domain vs launch metadata if available
- SNS/ENS-derived labels where relevant

This step should reduce false positives.

## Step 3: Score

Assign positive and negative weights and compute:

- confidence score
- recommended status
- explanation list

## Step 4: Emit Decision Candidate

Decision candidates:

- `AUTHORIZED`
- `PENDING_REVIEW`
- `UNKNOWN`

Never auto-emit `UNAUTHORIZED` as final without review.

---

## Confidence Model

Use a score from `0` to `100`.

Suggested weighting:

- exact normalized project-name match: `+25`
- exact normalized symbol match: `+20`
- approved creator wallet match: `+45`
- approved launch wallet match: `+35`
- registered Bags handle match: `+25`
- creator wallet mismatch against approved venue wallet set: `-30`
- provider username mismatch against claimed official venue handle: `-15`
- known scam suffix/prefix pattern: `+10` toward suspicious match, not authorization

### Suggested Thresholds

- `80+`
  clear authorized or highly suspicious, depending on wallet match result
- `60-79`
  pending review
- `<60`
  unknown unless manually escalated

The explanation must always accompany the score.

---

## Evidence Emission

Each match should emit an evidence list in shared format.

Examples:

- `NAME_MATCH`
- `SYMBOL_MATCH`
- `VENUE_CREATOR_MATCH`
- `VENUE_CREATOR_MISMATCH`
- `SOCIAL_MATCH`
- `SOCIAL_MISMATCH`

Example evidence bundle:

```json
[
  {
    "type": "NAME_MATCH",
    "summary": "Token name normalizes to the protected project slug",
    "weight": 25
  },
  {
    "type": "VENUE_CREATOR_MISMATCH",
    "summary": "Bags creator wallet is not in the project's approved launch wallet set",
    "weight": -30
  }
]
```

---

## Decision Policy

## Auto-Authorized

Allowed only when:

- candidate project is approved
- creator wallet matches approved launch wallet or approved founder wallet
- no strong contradictory evidence exists

This should create:

- a candidate authorized asset record
- optionally an approved mint record if policy allows automatic mint authorization for pre-authorized wallets

## Pending Review

Use when:

- name/symbol strongly match a protected project
- creator wallet does not match approved wallet set
- or venue identity signals conflict

This is the default suspicious Bags outcome.

## Unknown

Use when:

- not enough evidence links the launch to any protected project
- there is no strong signal in either direction

---

## Reviewer UX Requirements

For each pending Bags case, reviewers should see:

- project candidate
- mint
- Bags URL if available
- creator wallet
- launch wallet
- provider and provider username
- token name and symbol
- confidence score
- evidence list
- links to project record and prior related reports

Reviewer actions:

- mark authorized
- mark unauthorized
- request founder clarification
- dismiss false positive

---

## Output Records

The Bags adapter should write:

- `BagsLaunch`
- `UnauthorizedReport` with `status=PENDING_REVIEW` where warranted
- `LaunchEvidence[]`
- optional alert events for notifier systems

If a project is clearly matched and authorized, it should also emit a positive verification event so the frontend can reflect it quickly.

---

## Failure Modes

### Bags API Missing Fields

If creator/provider fields are missing:

- preserve raw response
- downgrade confidence
- rely more heavily on wallet and name heuristics

### Venue API Outage

If Bags API is unavailable:

- continue ingesting onchain mint data where possible
- mark evidence source degradation in logs and reviewer UI
- do not silently convert failures into `UNKNOWN`

### False Positives

Common sources:

- generic names
- ticker collisions
- fan/community tokens

Mitigations:

- protected project alias lists
- wallet-based checks
- reviewer confirmation before final unauthorized verdict

---

## Implementation Shape

Recommended directory:

- `watchers/solana/bags/`

Recommended modules:

- `client.ts`
  Bags API client
- `ingest.ts`
  launch ingestion
- `normalize.ts`
  raw Bags data to `BagsLaunch`
- `match.ts`
  candidate project selection and scoring
- `evidence.ts`
  evidence generation
- `pipeline.ts`
  orchestration

---

## Runtime Modes

Support:

- realtime watch mode
- historical backfill mode
- single-mint recheck mode

Examples:

```bash
pnpm bags-adapter watch
pnpm bags-adapter backfill --from-slot <slot>
pnpm bags-adapter recheck --mint <mint>
```

---

## Metrics

Track:

- launch detection latency
- enrichment success rate
- creator-wallet coverage rate
- pending-review volume
- reviewer-confirmed unauthorized rate
- false-positive rate

These metrics should drive whether the adapter is good enough to automate more of the flow.

---

## Immediate Build Tasks

1. define Bags API client interfaces
2. define normalized `BagsLaunch` schema
3. implement candidate project matcher against shared schema
4. emit `UnauthorizedReport` records for suspicious launches
5. connect frontend verification pages to Bags-enriched reports
