# Upgradeability

## Current State

The repo now supports two deployment models:

1. immutable core deployment
- [Registry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/Registry.sol)
- [ShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/ShieldFactory.sol)

2. upgradeable reference deployment
- [UpgradeableRegistry.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableRegistry.sol)
- [UpgradeableShieldFactory.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/UpgradeableShieldFactory.sol)
- [TransparentUpgradeableProxy.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/TransparentUpgradeableProxy.sol)
- [ProxyAdmin.sol](/Users/swarnava/Documents/Projects/tethics/contracts/src/reference/ProxyAdmin.sol)
- [DeployUpgradeable.s.sol](/Users/swarnava/Documents/Projects/tethics/contracts/script/DeployUpgradeable.s.sol)

## Recommended Production Model

Use proxies for the coordination layer:

- Registry proxy
- ShieldFactory proxy

Keep per-project Shields immutable:

- each Shield is deployed as a standalone contract
- this minimizes per-project upgrade risk
- upgrades happen at the registry / factory layer, not inside already-deployed Shield instances

## Why This Split

The registry and factory define protocol coordination and product evolution.

Shields are per-project operational contracts with simpler scope:

- route unauthorized funds to charity
- emit notifications
- respond to registry callbacks

That makes them better candidates for immutability, while the top-level coordination contracts benefit from an upgrade path.

## Governance Implications

Upgradeable deployments are not ownerless.

They introduce:

- proxy admin authority
- upgrade sequencing risk
- implementation review requirements

Production deployment should therefore specify:

- proxy admin owner
- expected upgrade process
- upgrade announcement policy
- pause / incident-response posture if introduced later

## Bootstrap Flow

For the upgradeable reference path:

1. deploy `ProxyAdmin`
2. deploy registry implementation
3. deploy shield factory implementation
4. deploy registry proxy and initialize it
5. deploy factory proxy and initialize it
6. wire the registry proxy to the factory proxy

See [DeployUpgradeable.s.sol](/Users/swarnava/Documents/Projects/tethics/contracts/script/DeployUpgradeable.s.sol).

## Frontend Implication

The frontend only needs the proxy addresses, not the implementation addresses.

After deployment, configure:

- `registry`
- `shieldFactory`

in [constants.js](/Users/swarnava/Documents/Projects/tethics/frontend/js/constants.js).
