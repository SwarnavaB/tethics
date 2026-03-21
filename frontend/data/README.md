# Records Store

This directory is the static records store used by the current frontend and Solana/Bags tooling.

## Files

- `projects.json`
  Canonical project records used for slug lookup and venue wallet matching
- `solana-attestations.json`
  Public Solana attestation feed used by the frontend Solana verify route
- `solana-reports.json`
  Output file written by the Bags watcher CLI

## Bootstrap Data

The initial records are seeded with a `tethics` bootstrap entry so the pipeline has a valid example shape.

Important:

- the seeded Solana addresses are placeholders
- replace them with real signer / creator / launch wallet addresses before any production use

## Suggested Curation Workflow

1. Add or update a project in `projects.json`
2. Add a corresponding attestation in `solana-attestations.json`
3. Run the Bags watcher against a mint or launch fixture
4. Review the emitted output in `solana-reports.json`
