## Summary

Bring Solana to true protocol parity with EVM by introducing a native Solana registry program, delegated governance, and browser-facing client support.

## Why

- Solana projects should not be permanently governed through EVM external claims.
- Bags.fm is a primary venue for unwanted token launches and requires first-class support.
- Solana founder and reviewer flows need native authority, native proposals, and native asset records.
- Future governance requires delegated Solana approvers and root rotation.

## Scope

- add Solana shared tooling and CLI support
- scaffold the native Solana registry program
- implement root authority, approver delegation, and pause controls
- add browser program client support
- add Solana asset and proposal handling in the UI

## Deliverables

- `solana/` package and native program scaffold
- delegated governance instructions and account model
- Solana program browser client
- Solana UI parity across registration and dashboard flows
- Bags adapter and watcher package scaffold

## Decision Record

- Solana authority is native to Solana
- upgrade authority and protocol root authority are separate concerns
- project identity is shared across ecosystems, but execution is chain-native
- venue-specific detection should remain modular

## Related Files

- `solana/`
- `frontend/js/solana-program.js`
- `frontend/js/app.js`
- `frontend/js/constants.js`
- `watchers/solana/bags/`
- `docs/SOLANA-MVP.md`
- `docs/BAGS-ADAPTER.md`

