// tethics Watcher - Onchain reporter
// Handles reporting unauthorized tokens to the Registry contract.

import { createWalletClient, createPublicClient, http, parseGwei } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { REGISTRY_ABI } from './constants.js';

export interface ReportResult {
  txHash: string;
  projectName: string;
  tokenAddress: string;
}

export interface ReporterConfig {
  privateKey: `0x${string}`;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  dryRun: boolean;
}

function makeChain(rpcUrl: string, chainId: number) {
  return {
    id: chainId,
    name: chainId === 8453 ? 'Base' : 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

/**
 * Submit a reportUnauthorizedToken transaction to the Registry.
 */
export async function reportToken(
  config: ReporterConfig,
  projectName: string,
  tokenAddress: `0x${string}`
): Promise<ReportResult> {
  if (config.dryRun) {
    console.log(`[DRY RUN] Would report: ${tokenAddress} as unauthorized for project "${projectName}"`);
    return { txHash: '0x' + '0'.repeat(64), projectName, tokenAddress };
  }

  const account = privateKeyToAccount(config.privateKey);
  const chain = makeChain(config.rpcUrl, config.chainId);

  const walletClient = createWalletClient({
    account,
    chain: chain as Parameters<typeof createWalletClient>[0]['chain'],
    transport: http(config.rpcUrl),
  });

  const txHash = await walletClient.writeContract({
    address: config.registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'reportUnauthorizedToken',
    args: [projectName, tokenAddress],
    chain: chain as Parameters<typeof createWalletClient>[0]['chain'],
  } as Parameters<typeof walletClient.writeContract>[0]);

  return { txHash, projectName, tokenAddress };
}

/**
 * Check if a token is already authorized (to avoid duplicate reports).
 */
export async function checkIsAuthorized(
  rpcUrl: string,
  chainId: number,
  registryAddress: `0x${string}`,
  projectName: string,
  tokenAddress: `0x${string}`
): Promise<boolean> {
  const chain = makeChain(rpcUrl, chainId);
  const client = createPublicClient({
    chain: chain as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(rpcUrl),
  });

  return client.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'isAuthorized',
    args: [projectName, tokenAddress],
  }) as Promise<boolean>;
}
