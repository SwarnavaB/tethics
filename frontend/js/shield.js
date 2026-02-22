// tethics - Shield contract interactions

import { getPublicClient, getWalletClient, getAccount } from './registry.js';
import { SHIELD_ABI } from './constants.js';

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getShieldInfo(shieldAddress) {
  const client = getPublicClient();
  const [projectName, charityAddress, founder, registry] = await Promise.all([
    client.readContract({ address: shieldAddress, abi: SHIELD_ABI, functionName: 'projectName' }),
    client.readContract({ address: shieldAddress, abi: SHIELD_ABI, functionName: 'charityAddress' }),
    client.readContract({ address: shieldAddress, abi: SHIELD_ABI, functionName: 'founder' }),
    client.readContract({ address: shieldAddress, abi: SHIELD_ABI, functionName: 'registry' }),
  ]);
  return { projectName, charityAddress, founder, registry };
}

export async function getShieldBalance(shieldAddress) {
  const client = getPublicClient();
  return client.getBalance({ address: shieldAddress });
}

export async function getCharityDrainLogs(shieldAddress, fromBlock = 'earliest') {
  const client = getPublicClient();
  try {
    return client.getLogs({
      address: shieldAddress,
      event: {
        type: 'event',
        name: 'FundsRoutedToCharity',
        inputs: [
          { name: 'tokenContract', type: 'address', indexed: true },
          { name: 'amount', type: 'uint256', indexed: false },
          { name: 'charityAddress', type: 'address', indexed: true },
        ],
      },
      fromBlock,
    });
  } catch {
    return [];
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function drainToken(shieldAddress, tokenAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: shieldAddress,
    abi: SHIELD_ABI,
    functionName: 'drainToken',
    args: [tokenAddress],
    account,
  });
}

export async function drainETH(shieldAddress) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: shieldAddress,
    abi: SHIELD_ABI,
    functionName: 'drainETH',
    args: [],
    account,
  });
}

export async function notifyBuyers(shieldAddress, unauthorizedToken, holders) {
  const wc = await getWalletClient();
  const account = await getAccount();
  return wc.writeContract({
    address: shieldAddress,
    abi: SHIELD_ABI,
    functionName: 'notifyBuyers',
    args: [unauthorizedToken, holders],
    account,
  });
}
