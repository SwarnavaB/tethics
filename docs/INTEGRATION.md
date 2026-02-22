# Integration Guide

This document explains how wallets, frontends, DEXs, and other tools can integrate with tethics.

---

## Core Query: Is This Token Authorized?

The most important integration is a single view call:

```solidity
// Solidity
IRegistry registry = IRegistry(REGISTRY_ADDRESS);
bool authorized = registry.isAuthorized("projectname", tokenAddress);
```

```typescript
// TypeScript (viem)
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({ chain: base, transport: http() });

const isAuthorized = await client.readContract({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  functionName: 'isAuthorized',
  args: ['projectname', tokenAddress],
});
```

```python
# Python (web3.py)
from web3 import Web3
w3 = Web3(Web3.HTTPProvider("https://mainnet.base.org"))
registry = w3.eth.contract(address=REGISTRY_ADDRESS, abi=REGISTRY_ABI)
is_authorized = registry.functions.isAuthorized("projectname", token_address).call()
```

**Returns:** `true` if the project's verified founder authorized this token. `false` means unauthorized OR project not registered.

---

## Getting Full Project Info

```typescript
const info = await client.readContract({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  functionName: 'getProjectInfo',
  args: ['projectname'],
});

// info.exists         : bool: project is registered
// info.founder        : address: verified founder address
// info.shieldContract : address: their Shield contract (0x0 if not deployed)
// info.verificationProofs: bytes32[]: stored proof hashes
// info.registeredAt   : uint256: registration timestamp
// info.challengeDeadline: uint256: dispute window closes at this time
```

---

## Batch Queries (Gas-Optimized)

For wallets showing token lists, use the hash-based query to avoid re-computing name hashes:

```typescript
import { keccak256, encodePacked, toHex } from 'viem';

// Pre-compute name hash once
const nameHash = keccak256(encodePacked(['string'], ['projectname']));

// Then query by hash (cheaper: no string normalization in contract)
const isAuth = await client.readContract({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  functionName: 'isAuthorizedByHash',
  args: [nameHash, tokenAddress],
});
```

---

## Event Listening

Listen for real-time updates:

```typescript
// Watch for new unauthorized token reports
client.watchContractEvent({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  eventName: 'UnauthorizedTokenReported',
  onLogs: (logs) => {
    for (const log of logs) {
      console.log(`⚠️  Unauthorized: ${log.args.tokenContract} (project: ${log.args.name})`);
    }
  },
});

// Watch for new project registrations
client.watchContractEvent({
  address: REGISTRY_ADDRESS,
  abi: REGISTRY_ABI,
  eventName: 'ProjectRegistered',
  onLogs: (logs) => {
    for (const log of logs) {
      console.log(`✅ New project: ${log.args.name} by ${log.args.founder}`);
    }
  },
});
```

---

## Wallet Integration (MetaMask, Coinbase Wallet, etc.)

Show a warning banner when a user is about to interact with an unauthorized token:

```typescript
async function checkTokenBeforeSwap(tokenAddress: string, projectHint: string) {
  const isAuth = await client.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'isAuthorized',
    args: [projectHint, tokenAddress],
  });

  if (!isAuth) {
    // Show warning in wallet UI
    showWarning({
      title: "Unverified Token",
      message: `This token has NOT been authorized by the verified founder of "${projectHint}". Proceed with caution.`,
      link: `https://tethics.eth/#/verify/${projectHint}`,
    });
  }
}
```

---

## DEX Integration

Token swap UIs can show verification badges:

```typescript
// Before rendering token in list
const projectName = guessProjectName(token.symbol); // your existing logic
if (projectName) {
  const verified = await registry.read.isAuthorized([projectName, token.address]);
  token.badge = verified ? '✓ Verified' : '⚠ Unverified';
  token.verifyUrl = `https://tethics.eth/#/verify/${projectName}`;
}
```

---

## Block Explorer Integration

Block explorers (Basescan, Blockscout) can add a "tethics" column to token lists:

```
GET /api/tokenshield/check?name=<projectName>&token=<tokenAddress>
```

Since tethics has no backend, explorers can query the contract directly using their existing RPC infrastructure.

---

## The Graph Subgraph (coming soon)

A subgraph will be published to make historical queries easy:

```graphql
query {
  projects(where: { name: "myproject" }) {
    id
    founder
    shieldContract
    authorizedTokens { id }
    reports(orderBy: timestamp, orderDirection: desc) {
      tokenContract
      reporter
      timestamp
    }
  }
}
```

Events emitted by Registry and Shield are designed to be rich enough to reconstruct all state without reading storage.

---

## Contract Addresses

| Chain | Registry | ShieldFactory |
|-------|----------|---------------|
| Base Mainnet (8453) | `TBD` | `TBD` |
| Base Sepolia (84532) | `TBD` | `TBD` |

---

## ABI

The full ABI is available in:
- `contracts/out/Registry.sol/Registry.json`
- `contracts/out/ShieldFactory.sol/ShieldFactory.json`
- `contracts/out/Shield.sol/Shield.json`
- `frontend/js/constants.js` (browser-ready)

---

## Security Notes

- Always normalize project names before querying (lowercase, trim whitespace). The contract normalizes onchain, so `"MyProject"`, `"myproject"`, and `"  myproject  "` all resolve to the same entry.
- A `false` result from `isAuthorized` does NOT necessarily mean the token is a scam: it means the founder hasn't authorized it. The founder may have launched a token without registering on tethics.
- tethics is a signal, not a verdict. Use it as one data point among many.
