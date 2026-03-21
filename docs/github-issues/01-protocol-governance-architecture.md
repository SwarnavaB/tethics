## Summary

Finalize the production-grade protocol architecture for TETHICS as a chain-native, open-source public good with explicit governance boundaries across EVM and Solana.

## Why

- Earlier iterations mixed Solana governance into the EVM control plane for speed.
- The long-term product requires chain-native authority on each ecosystem.
- `tethics.eth` should be the initial governance root on EVM, with delegated roles over time.
- Public rationale should live in issues, not only in commit messages or chat history.

## Scope

- define the production architecture rooted in `tethics.eth`
- document chain-native EVM and Solana governance boundaries
- define shared project and asset model across both ecosystems
- define upgradeability, delegation, and emergency posture
- document the public no-backend operating model

## Deliverables

- production architecture plan
- onchain UI specification
- shared schema documentation
- Solana MVP / parity implementation plan
- upgradeability and deployment docs

## Decision Record

- EVM and Solana projects must be governed natively on their own chains
- shared UI and content-addressed evidence remain cross-chain
- `tethics.eth` is the bootstrap governance root on EVM
- delegation is a first-class requirement, not a later patch

## Related Files

- `docs/PRODUCTION-ARCHITECTURE-PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/ONCHAIN-UI-SPEC.md`
- `docs/SCHEMA.md`
- `docs/SOLANA-MVP.md`
- `docs/UI-PARITY-IMPLEMENTATION.md`
- `docs/UPGRADEABILITY.md`
- `docs/DEPLOYMENT-CHECKLIST.md`

