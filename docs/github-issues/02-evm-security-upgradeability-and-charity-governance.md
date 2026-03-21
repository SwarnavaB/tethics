## Summary

Harden the EVM coordination layer so the Base deployment is safe, upgradeable, and operationally governable as an open-source protocol.

## Why

- Registry and ShieldFactory are the canonical coordination layer for EVM projects.
- The previous implementation had correctness and safety gaps around reporting, charity routing, and deterministic deployment assumptions.
- The protocol needs upgradeable reference contracts for safer long-term maintenance.
- Charity routing needs governed options rather than arbitrary founder-supplied addresses.

## Scope

- harden `Registry`, `Shield`, and `ShieldFactory`
- add reference proxy deployment contracts
- add slippage-bounded drain flow
- add charity catalog governance and delegation
- expand tests and internal audit notes

## Deliverables

- security fixes in EVM contracts
- upgradeable reference contracts and deployment script
- charity option governance in registry/factory
- expanded Foundry coverage
- security audit write-up

## Decision Record

- per-project Shields stay immutable
- coordination contracts get the upgradeable reference path
- charity selection is curated onchain, then chosen by founders from approved options
- reviewer, charity, and protocol roles should remain distinct

## Related Files

- `contracts/src/Registry.sol`
- `contracts/src/Shield.sol`
- `contracts/src/ShieldFactory.sol`
- `contracts/src/interfaces/IRegistry.sol`
- `contracts/src/interfaces/IShield.sol`
- `contracts/src/reference/`
- `contracts/script/DeployUpgradeable.s.sol`
- `contracts/test/`
- `docs/SECURITY-AUDIT.md`
- `docs/UPGRADEABILITY.md`

