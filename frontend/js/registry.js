// tethics - Registry contract read/write wrappers
// Uses viem for all chain interactions

import { createPublicClient, createWalletClient, custom, http, keccak256, encodePacked, encodeAbiParameters, parseAbiParameters, toBytes, toHex, concat } from 'https://esm.sh/viem@2';
import { REGISTRY_ABI, SHIELD_FACTORY_ABI, DEFAULT_CHAIN } from './constants.js';

// Normalize project name (mirrors StringUtils.normalize in Solidity)
export function normalizeName(name) {
  return name.trim().toLowerCase();
}

// Compute the commitment hash a founder must sign for DEPLOYER_SIG proof
// Must match VerificationLib.registrationCommitment()
export function registrationCommitment(projectName, founderAddress) {
  const innerHash = keccak256(
    encodePacked(
      ['string', 'string', 'string'],
      ['tethics:register:', projectName, ':', founderAddress.toLowerCase()]
    )
  );
  // EIP-191 personal sign prefix
  const prefix = toBytes('\x19Ethereum Signed Message:\n32');
  const prefixHex = toHex(prefix);
  return keccak256(concat([prefixHex, innerHash]));
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

export async function predictShieldAddress(founderAddress, projectName) {
  const client = getPublicClient();
  return client.readContract({
    address: factoryAddress(),
    abi: SHIELD_FACTORY_ABI,
    functionName: 'predictShieldAddress',
    args: [founderAddress, normalizeName(projectName)],
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

export async function deployShield(projectName, charityAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: factoryAddress(),
    abi: SHIELD_FACTORY_ABI,
    functionName: 'deployShield',
    args: [normalizeName(projectName), charityAddress],
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
