// tethics Watcher - DEX factory event listeners
// Watches for new token pool creation events on Uniswap V3 and Aerodrome.

import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import {
  UNISWAP_V3_FACTORY_ABI,
  ERC20_ABI,
} from './constants.js';

export interface NewTokenEvent {
  tokenAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  pairWithAddress: Address;
  blockNumber: bigint;
  txHash: string;
  source: 'uniswap-v3' | 'aerodrome' | 'uniswap-v2';
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
 * Fetch ERC20 token name and symbol, returning empty strings on failure.
 */
async function getTokenMeta(
  client: PublicClient,
  tokenAddress: Address
): Promise<{ name: string; symbol: string }> {
  try {
    const [name, symbol] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'name' }),
      client.readContract({ address: tokenAddress, abi: ERC20_ABI, functionName: 'symbol' }),
    ]);
    return { name: name as string, symbol: symbol as string };
  } catch {
    return { name: '', symbol: '' };
  }
}

/**
 * Watch Uniswap V3 PoolCreated events and emit new token info.
 */
export function watchUniswapV3Pools(
  rpcUrl: string,
  chainId: number,
  factoryAddress: Address,
  wethAddress: Address,
  onNewToken: (event: NewTokenEvent) => void
): () => void {
  const chain = makeChain(rpcUrl, chainId);
  const client = createPublicClient({
    chain: chain as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(rpcUrl),
  });

  const unwatch = client.watchContractEvent({
    address: factoryAddress,
    abi: UNISWAP_V3_FACTORY_ABI,
    eventName: 'PoolCreated',
    onLogs: async (logs) => {
      for (const log of logs) {
        const { token0, token1, pool } = log.args as {
          token0: Address;
          token1: Address;
          pool: Address;
          fee: number;
          tickSpacing: number;
        };

        // Identify which token is the "new" token (not WETH)
        const isToken0WETH = token0.toLowerCase() === wethAddress.toLowerCase();
        const newToken = isToken0WETH ? token1 : token0;
        const pairedWith = isToken0WETH ? token0 : token1;

        const meta = await getTokenMeta(client, newToken);

        onNewToken({
          tokenAddress: newToken,
          tokenName: meta.name,
          tokenSymbol: meta.symbol,
          pairWithAddress: pairedWith,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '',
          source: 'uniswap-v3',
        });
      }
    },
    onError: (error) => {
      console.error('[UniswapV3 Watcher] Error:', error.message);
    },
  });

  return unwatch;
}

/**
 * Scan historical blocks for pool creation events (backfill mode).
 */
export async function scanHistoricalPools(
  rpcUrl: string,
  chainId: number,
  factoryAddress: Address,
  wethAddress: Address,
  fromBlock: bigint,
  toBlock: bigint
): Promise<NewTokenEvent[]> {
  const chain = makeChain(rpcUrl, chainId);
  const client = createPublicClient({
    chain: chain as Parameters<typeof createPublicClient>[0]['chain'],
    transport: http(rpcUrl),
  });

  const events: NewTokenEvent[] = [];

  // Query in chunks of 2000 blocks to avoid RPC limits
  const CHUNK_SIZE = 2000n;
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n < toBlock ? start + CHUNK_SIZE - 1n : toBlock;

    try {
      const logs = await client.getLogs({
        address: factoryAddress,
        event: {
          type: 'event',
          name: 'PoolCreated',
          inputs: UNISWAP_V3_FACTORY_ABI[0].inputs as any,
        },
        fromBlock: start,
        toBlock: end,
      });

      for (const log of logs) {
        const args = log.args as { token0: Address; token1: Address };
        const isToken0WETH = args.token0.toLowerCase() === wethAddress.toLowerCase();
        const newToken = isToken0WETH ? args.token1 : args.token0;
        const pairedWith = isToken0WETH ? args.token0 : args.token1;

        const meta = await getTokenMeta(client, newToken);

        events.push({
          tokenAddress: newToken,
          tokenName: meta.name,
          tokenSymbol: meta.symbol,
          pairWithAddress: pairedWith,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '',
          source: 'uniswap-v3',
        });
      }
    } catch (err) {
      const error = err as Error;
      console.warn(`[Scan] Failed to fetch blocks ${start}-${end}: ${error.message}`);
    }
  }

  return events;
}
