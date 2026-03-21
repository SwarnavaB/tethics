# Curator Workflow

Use this directory as the working area for your real first-party project curation process.

## Goal

Move from bootstrap placeholder records to real curated records signed by the `tethics.sol` authority set.

## Suggested Flow

1. Copy `manifest.template.json` to a project-specific manifest
2. Fill the real slug, display name, founder wallets, and approved Bags wallets
3. Generate a project bundle with `tethics-solana`
4. If needed, sign the generated attestations in the same step
5. Copy the generated project record into `../projects.json`
6. Copy the generated attestations into `../solana-attestations.json`
7. Run the Bags watcher to produce or refresh `../solana-reports.json`

## Commands

```bash
# Generate a project record + attestation bundle from one manifest
tethics-solana generate-curation-bundle \
  --manifest frontend/data/curation/manifest.template.json \
  --output-dir frontend/data/curation/out \
  --issuer <YOUR_TETHICS_SOL_PUBLIC_KEY> \
  --sign \
  --secret-key-file /path/to/solana-keypair.json

# Or sign an individual attestation manually
tethics-solana sign-attestation \
  --input frontend/data/curation/out/myproject.attestation.1.project_approval.json \
  --output frontend/data/curation/out/myproject.attestation.1.project_approval.signed.json \
  --secret-key-file /path/to/solana-keypair.json

# Verify a signed attestation
tethics-solana verify-attestation \
  --input frontend/data/curation/out/myproject.attestation.1.project_approval.signed.json
```

## Secret Keys

The signer supports:

- a Solana keypair file containing a JSON byte array
- `TETHICS_SOL_SECRET_KEY` as either base58 or JSON byte array

Do not commit real secret keys.
