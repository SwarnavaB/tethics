# Deployment Checklist

## Goal

Deploy tethics as:

- upgraded Base registry with external claim support
- static frontend
- browser-side artifact upload
- no private backend

## Pre-Deploy

1. Confirm the registry source includes:
- `submitExternalClaim`
- `reviewExternalClaim`
- `getExternalClaim`

2. Decide the initial production chain:
- Base Sepolia for staging
- Base Mainnet for production

3. Decide the initial governance wallet set:
- owner wallet
- initial approver wallets
- signer wallet for curated Solana artifacts

4. Decide the initial artifact upload path:
- Pinata JWT with restricted scope
- or local / self-managed Kubo-compatible IPFS endpoint

## Contract Deploy

1. Deploy the upgraded `Registry`
2. Deploy `ShieldFactory`
3. Verify both contracts on Basescan
4. Record:
- chain id
- registry address
- shield factory address
- deployment tx hashes

## Frontend Config

Update [constants.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/constants.js):

- `CHAINS.BASE_SEPOLIA.registry`
- `CHAINS.BASE_SEPOLIA.shieldFactory`
- `CHAINS.BASE_MAINNET.registry`
- `CHAINS.BASE_MAINNET.shieldFactory`

Do not deploy the public frontend with `TBD` placeholders.

## Governance Bootstrap

1. Confirm the owner wallet is correct onchain
2. Add initial approvers if needed
3. Perform one dry-run external claim submission on testnet
4. Perform one dry-run external claim review on testnet

## Artifact Flow Validation

From the frontend:

1. Generate a proposal bundle
2. Upload it to IPFS from the browser
3. Confirm returned `ipfs://` URI resolves via gateway
4. Anchor the claim onchain
5. Use the artifact integrity tool to verify local JSON against the anchored hash
6. Review the claim and upload the review artifact
7. Confirm the review artifact hash and URI are visible

## Static Frontend Publish

1. Build or publish the static frontend
2. Confirm RPC reads work from the deployed host
3. Confirm wallet connect works
4. Confirm hash routing works on the host
5. Confirm IPFS upload CORS works from the deployed origin

## Production Readiness

Before announcing:

1. Verify one approved Base project end to end
2. Verify one external Solana claim end to end
3. Verify one rejected external claim end to end
4. Verify the public search / verify path shows the correct timeline
5. Verify the dashboard correctly distinguishes owner vs approver controls

## Transparency Requirements

The launch is not complete unless all of the following are public:

- deployed contract addresses
- owner wallet
- approver wallets
- claim submission events
- claim review events
- artifact URIs
- artifact hashes

## Rollback Rule

If the upgraded registry is not the one wired into the frontend, do not publish the frontend as production-ready. The UI now expects the external-claim flow to exist onchain.
