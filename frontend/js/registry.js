// tethics - Registry contract read/write wrappers
// Uses viem for all chain interactions

import { createPublicClient, createWalletClient, custom, http, keccak256, encodePacked, parseAbi, toBytes, toHex, concat } from 'https://esm.sh/viem@2';
import { REGISTRY_ABI, DEFAULT_CHAIN } from './constants.js';
import { canonicalizeArtifact } from './artifacts.js';

const EXTERNAL_CLAIMS_ABI = parseAbi([
  'function submitExternalClaim(string name, string ecosystem, bytes32 payloadHash, string metadataURI) returns (uint256 claimId)',
  'function reviewExternalClaim(uint256 claimId, bool approved, string reviewNotes, bytes32 resolutionHash, string resolutionURI)',
  'function getExternalClaim(uint256 claimId) view returns ((uint256 claimId, bytes32 nameHash, string name, string ecosystem, address proposer, bytes32 payloadHash, string metadataURI, uint256 submittedAt, bool exists, bool reviewed, bool approved, address reviewer, uint256 reviewedAt, bytes32 resolutionHash, string resolutionURI, string reviewNotes))',
  'event ExternalClaimSubmitted(uint256 indexed claimId, bytes32 indexed nameHash, string name, string ecosystem, address indexed proposer, bytes32 payloadHash, string metadataURI)',
  'event ExternalClaimReviewed(uint256 indexed claimId, bytes32 indexed nameHash, string name, string ecosystem, address indexed reviewer, bool approved, bytes32 resolutionHash, string resolutionURI, string reviewNotes)',
]);

const EXTERNAL_ASSETS_ABI = parseAbi([
  'function authorizeExternalAsset(string name, string ecosystem, string assetType, string assetId, string metadataURI)',
  'function revokeExternalAsset(string name, string ecosystem, string assetType, string assetId, string metadataURI)',
  'function getExternalAsset(string name, string ecosystem, string assetType, string assetId) view returns ((bytes32 nameHash, string name, string ecosystem, string assetType, string assetId, string metadataURI, bool authorized, address updatedBy, uint256 updatedAt, bool exists))',
  'event ExternalAssetAuthorized(bytes32 indexed nameHash, bytes32 indexed assetKey, string name, string ecosystem, string assetType, string assetId, address indexed actor, string metadataURI)',
  'event ExternalAssetRevoked(bytes32 indexed nameHash, bytes32 indexed assetKey, string name, string ecosystem, string assetType, string assetId, address indexed actor, string metadataURI)',
]);

const CHARITY_CATALOG_ABI = parseAbi([
  'function charityOptionCount() view returns (uint256)',
  'function isCharityManager(address manager) view returns (bool)',
  'function getCharityOption(uint256 charityId) view returns ((uint256 charityId, string name, address payoutAddress, string metadataURI, bool active, uint256 createdAt, uint256 updatedAt, bool exists))',
  'function addCharityOption(string name, address payoutAddress, string metadataURI) returns (uint256 charityId)',
  'function updateCharityOption(uint256 charityId, string name, address payoutAddress, string metadataURI, bool active)',
  'function addCharityManager(address manager)',
  'function removeCharityManager(address manager)',
  'event CharityOptionConfigured(uint256 indexed charityId, string name, address indexed payoutAddress, string metadataURI, bool active, address indexed actor)',
  'event CharityManagerAdded(address indexed manager)',
  'event CharityManagerRemoved(address indexed manager)',
]);

const GOVERNANCE_EVENTS_ABI = parseAbi([
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'event ApproverAdded(address indexed approver)',
  'event ApproverRemoved(address indexed approver)',
]);

const SHIELD_FACTORY_PREDICTION_ABI = parseAbi([
  'function predictShieldAddress(address founder, string projectName, uint256 charityId) view returns (address predicted)',
]);

const SHIELD_FACTORY_DEPLOY_ABI = parseAbi([
  'function deployShield(string projectName, uint256 charityId) returns (address shield)',
]);

// Normalize project name (mirrors StringUtils.normalize in Solidity)
export function normalizeName(name) {
  return name.trim().toLowerCase();
}

// Compute the commitment hash a founder must sign for DEPLOYER_SIG proof
// Must match VerificationLib.registrationCommitment()
export function registrationCommitment(projectName, founderAddress) {
  const innerHash = keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string'],
      ['tethics:register:', projectName, ':', founderAddress.toLowerCase()]
    )
  );
  // EIP-191 personal sign prefix
  const prefix = toBytes('\x19Ethereum Signed Message:\n32');
  const prefixHex = toHex(prefix);
  return keccak256(concat([prefixHex, innerHash]));
}

export function hashExternalClaimPayload(payload) {
  const serialized = typeof payload === 'string' ? payload : canonicalizeArtifact(payload);
  return keccak256(toHex(new TextEncoder().encode(serialized)));
}

export function hashExternalAssetKey(ecosystem, assetType, assetId) {
  return keccak256(
    encodePacked(
      ['string', 'string', 'string', 'string', 'string'],
      ['tethics:asset:', normalizeName(ecosystem), ':', normalizeName(assetType), `:${String(assetId || '').trim()}`],
    ),
  );
}

let _publicClient = null;
let _walletClient = null;
let _chain = DEFAULT_CHAIN;

export function setChain(chain) {
  _chain = chain;
  _publicClient = null;
  _walletClient = null;
}

export function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: { id: _chain.id, name: _chain.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [_chain.rpcUrl] } } },
      transport: http(_chain.rpcUrl),
    });
  }
  return _publicClient;
}

export async function getWalletClient() {
  if (!window.ethereum) throw new Error('No wallet detected. Install MetaMask or Coinbase Wallet.');
  if (!_walletClient) {
    _walletClient = createWalletClient({
      chain: { id: _chain.id, name: _chain.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [_chain.rpcUrl] } } },
      transport: custom(window.ethereum),
    });
  }
  return _walletClient;
}

export async function getAccount() {
  const wc = await getWalletClient();
  const accounts = await wc.getAddresses();
  return accounts[0] || null;
}

function registryAddress() {
  if (!_chain.registry || _chain.registry === 'TBD') throw new Error('Registry not yet deployed on ' + _chain.name);
  return _chain.registry;
}

function factoryAddress() {
  if (!_chain.shieldFactory || _chain.shieldFactory === 'TBD') throw new Error('ShieldFactory not yet deployed on ' + _chain.name);
  return _chain.shieldFactory;
}

// ── Read functions ────────────────────────────────────────────────────────────

export async function isRegistered(name) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'isRegistered',
    args: [normalizeName(name)],
  });
}

export async function getProjectInfo(name) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'getProjectInfo',
    args: [normalizeName(name)],
  });
}

export async function isAuthorized(name, tokenAddress) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'isAuthorized',
    args: [normalizeName(name), tokenAddress],
  });
}

export async function getReporterScore(address) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'reporterScore',
    args: [address],
  });
}

export async function predictShieldAddress(founderAddress, projectName, charityId) {
  const client = getPublicClient();
  return client.readContract({
    address: factoryAddress(),
    abi: SHIELD_FACTORY_PREDICTION_ABI,
    functionName: 'predictShieldAddress',
    args: [founderAddress, normalizeName(projectName), BigInt(charityId)],
  });
}

export async function getRegistryOwner() {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'owner',
    args: [],
  });
}

export async function isRegistryApprover(address) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'isApprover',
    args: [address],
  });
}

export async function isPending(name) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'isPending',
    args: [normalizeName(name)],
  });
}

export async function getPendingInfo(name) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'getPendingInfo',
    args: [normalizeName(name)],
  });
}

export async function getExternalClaim(claimId) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: EXTERNAL_CLAIMS_ABI,
    functionName: 'getExternalClaim',
    args: [BigInt(claimId)],
  });
}

export async function getExternalAsset(name, ecosystem, assetType, assetId) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: EXTERNAL_ASSETS_ABI,
    functionName: 'getExternalAsset',
    args: [normalizeName(name), normalizeName(ecosystem), normalizeName(assetType), String(assetId || '').trim()],
  });
}

export async function getCharityOption(charityId) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'getCharityOption',
    args: [BigInt(charityId)],
  });
}

export async function listCharityOptions() {
  const client = getPublicClient();
  const count = await client.readContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'charityOptionCount',
    args: [],
  });

  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index + 1));
  const options = await Promise.all(ids.map((id) => client.readContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'getCharityOption',
    args: [id],
  })));

  return options.filter((entry) => entry.exists);
}

export async function isCharityCatalogManager(address) {
  const client = getPublicClient();
  return client.readContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'isCharityManager',
    args: [address],
  });
}

// ── Write functions ───────────────────────────────────────────────────────────

export async function registerProject(name, proofs) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'register',
    args: [normalizeName(name), proofs],
    account,
  });
}

export async function authorizeToken(name, tokenAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'authorizeToken',
    args: [normalizeName(name), tokenAddress],
    account,
  });
}

export async function revokeToken(name, tokenAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'revokeToken',
    args: [normalizeName(name), tokenAddress],
    account,
  });
}

export async function reportUnauthorizedToken(name, tokenAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'reportUnauthorizedToken',
    args: [normalizeName(name), tokenAddress],
    account,
  });
}

export async function approveRegistration(name) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'approveRegistration',
    args: [normalizeName(name)],
    account,
  });
}

export async function rejectRegistration(name, reason) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'rejectRegistration',
    args: [normalizeName(name), reason],
    account,
  });
}

export async function addApprover(approverAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'addApprover',
    args: [approverAddress],
    account,
  });
}

export async function removeApprover(approverAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'removeApprover',
    args: [approverAddress],
    account,
  });
}

export async function transferRegistryOwnership(newOwnerAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'transferOwnership',
    args: [newOwnerAddress],
    account,
  });
}

export async function deployShield(projectName, charityId) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: factoryAddress(),
    abi: SHIELD_FACTORY_DEPLOY_ABI,
    functionName: 'deployShield',
    args: [normalizeName(projectName), BigInt(charityId)],
    account,
  });
}

export async function addCharityOption(name, payoutAddress, metadataURI) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'addCharityOption',
    args: [name.trim(), payoutAddress, metadataURI.trim()],
    account,
  });
}

export async function updateCharityOption(charityId, name, payoutAddress, metadataURI, active) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'updateCharityOption',
    args: [BigInt(charityId), name.trim(), payoutAddress, metadataURI.trim(), Boolean(active)],
    account,
  });
}

export async function addCharityManager(managerAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'addCharityManager',
    args: [managerAddress],
    account,
  });
}

export async function removeCharityManager(managerAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: CHARITY_CATALOG_ABI,
    functionName: 'removeCharityManager',
    args: [managerAddress],
    account,
  });
}

export async function submitExternalClaim(name, ecosystem, payloadHash, metadataURI) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: EXTERNAL_CLAIMS_ABI,
    functionName: 'submitExternalClaim',
    args: [normalizeName(name), ecosystem, payloadHash, metadataURI],
    account,
  });
}

export async function reviewExternalClaim(claimId, approved, reviewNotes, resolutionHash, resolutionURI) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: EXTERNAL_CLAIMS_ABI,
    functionName: 'reviewExternalClaim',
    args: [BigInt(claimId), approved, reviewNotes, resolutionHash, resolutionURI],
    account,
  });
}

export async function authorizeExternalAsset(name, ecosystem, assetType, assetId, metadataURI) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: EXTERNAL_ASSETS_ABI,
    functionName: 'authorizeExternalAsset',
    args: [normalizeName(name), normalizeName(ecosystem), normalizeName(assetType), String(assetId || '').trim(), metadataURI],
    account,
  });
}

export async function revokeExternalAsset(name, ecosystem, assetType, assetId, metadataURI) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: registryAddress(),
    abi: EXTERNAL_ASSETS_ABI,
    functionName: 'revokeExternalAsset',
    args: [normalizeName(name), normalizeName(ecosystem), normalizeName(assetType), String(assetId || '').trim(), metadataURI],
    account,
  });
}

// ── Event fetching ────────────────────────────────────────────────────────────

export async function getRecentReports(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const logs = await client.getLogs({
      address: registryAddress(),
      event: {
        type: 'event',
        name: 'UnauthorizedTokenReported',
        inputs: [
          { name: 'nameHash', type: 'bytes32', indexed: true },
          { name: 'name', type: 'string', indexed: false },
          { name: 'tokenContract', type: 'address', indexed: true },
          { name: 'reporter', type: 'address', indexed: true },
        ],
      },
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentSubmissions(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const logs = await client.getLogs({
      address: registryAddress(),
      event: {
        type: 'event',
        name: 'RegistrationSubmitted',
        inputs: [
          { name: 'nameHash', type: 'bytes32', indexed: true },
          { name: 'name', type: 'string', indexed: false },
          { name: 'founder', type: 'address', indexed: true },
          { name: 'submittedAt', type: 'uint256', indexed: false },
        ],
      },
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentRegistrations(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const logs = await client.getLogs({
      address: registryAddress(),
      event: {
        type: 'event',
        name: 'ProjectRegistered',
        inputs: [
          { name: 'nameHash', type: 'bytes32', indexed: true },
          { name: 'name', type: 'string', indexed: false },
          { name: 'founder', type: 'address', indexed: true },
          { name: 'challengeDeadline', type: 'uint256', indexed: false },
        ],
      },
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentExternalClaims(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const logs = await client.getLogs({
      address: registryAddress(),
      event: EXTERNAL_CLAIMS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ExternalClaimSubmitted'),
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentExternalClaimReviews(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const logs = await client.getLogs({
      address: registryAddress(),
      event: EXTERNAL_CLAIMS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ExternalClaimReviewed'),
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentExternalAssetAuthorizations(ecosystem, assetType, assetId, fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const assetKey = hashExternalAssetKey(ecosystem, assetType, assetId);
    const logs = await client.getLogs({
      address: registryAddress(),
      event: EXTERNAL_ASSETS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ExternalAssetAuthorized'),
      args: { assetKey },
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentExternalAssetRevocations(ecosystem, assetType, assetId, fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const assetKey = hashExternalAssetKey(ecosystem, assetType, assetId);
    const logs = await client.getLogs({
      address: registryAddress(),
      event: EXTERNAL_ASSETS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ExternalAssetRevoked'),
      args: { assetKey },
      fromBlock,
    });
    return logs;
  } catch {
    return [];
  }
}

export async function getRecentOwnershipTransfers(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    return await client.getLogs({
      address: registryAddress(),
      event: GOVERNANCE_EVENTS_ABI.find((entry) => entry.type === 'event' && entry.name === 'OwnershipTransferred'),
      fromBlock,
    });
  } catch {
    return [];
  }
}

export async function getRecentApproverEvents(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const [added, removed] = await Promise.all([
      client.getLogs({
        address: registryAddress(),
        event: GOVERNANCE_EVENTS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ApproverAdded'),
        fromBlock,
      }),
      client.getLogs({
        address: registryAddress(),
        event: GOVERNANCE_EVENTS_ABI.find((entry) => entry.type === 'event' && entry.name === 'ApproverRemoved'),
        fromBlock,
      }),
    ]);
    return { added, removed };
  } catch {
    return { added: [], removed: [] };
  }
}

export async function getRecentCharityManagerEvents(fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    const [added, removed] = await Promise.all([
      client.getLogs({
        address: registryAddress(),
        event: CHARITY_CATALOG_ABI.find((entry) => entry.type === 'event' && entry.name === 'CharityManagerRemoved'),
        fromBlock,
      }),
      client.getLogs({
        address: registryAddress(),
        event: CHARITY_CATALOG_ABI.find((entry) => entry.type === 'event' && entry.name === 'CharityManagerAdded'),
        fromBlock,
      }),
    ]);
    return { added, removed };
  } catch {
    return { added: [], removed: [] };
  }
}
