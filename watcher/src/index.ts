#!/usr/bin/env node
// tethics Watcher - Main CLI entry point
// Watches for new token deployments and reports unauthorized ones to the Registry.

import 'dotenv/config';
import { createPublicClient, http, type Address } from 'viem';
import { Command } from 'commander';
import chalk from 'chalk';
import { watchUniswapV3Pools, scanHistoricalPools, type NewTokenEvent } from './factories.js';
import { findMatchingProjects } from './matcher.js';
import { reportToken, checkIsAuthorized, type ReporterConfig } from './reporter.js';
import { REGISTRY_ABI, BASE_MAINNET, BASE_SEPOLIA } from './constants.js';

const VERSION = '0.1.0';

// ── CLI setup ─────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('tethics-watcher')
  .description('Watch for unauthorized tokens and report them to the tethics Registry')
  .version(VERSION);

program
  .command('watch')
  .description('Watch for new token pools in real-time and report impersonators')
  .option('--network <network>', 'Network to watch: mainnet or sepolia', 'mainnet')
  .option('--dry-run', 'Log detections without submitting transactions', false)
  .option('--auto-report', 'Automatically report detected tokens onchain', false)
  .option('--registry <address>', 'Override Registry contract address')
  .action(async (opts) => {
    const config = resolveConfig(opts.network, opts.registry);
    const reporterConfig = resolveReporterConfig(config, opts.dryRun || !opts.autoReport);

    console.log(chalk.cyan(`\ntethics Watcher v${VERSION}`));
    console.log(chalk.gray(`Network: ${config.network}  |  Registry: ${config.registry}`));
    console.log(chalk.gray(`Mode: ${opts.autoReport ? chalk.yellow('AUTO-REPORT') : chalk.blue('MONITOR ONLY')}\n`));

    const projects = await fetchRegisteredProjects(config);
    console.log(chalk.green(`Loaded ${projects.length} registered projects`));

    if (projects.length === 0) {
      console.log(chalk.yellow('Warning: No registered projects found. Check your Registry address.'));
    }

    const handle = (event: NewTokenEvent) => handleNewToken(event, projects, config, reporterConfig);

    watchUniswapV3Pools(
      config.rpcUrl,
      config.chainId,
      config.uniswapV3Factory,
      config.weth,
      handle
    );

    console.log(chalk.green('Watching for new pools… (Ctrl+C to stop)\n'));
    await keepAlive();
  });

program
  .command('scan')
  .description('Scan historical blocks for unauthorized tokens')
  .requiredOption('--from-block <number>', 'Start block number')
  .option('--to-block <number>', 'End block number (default: latest)')
  .option('--network <network>', 'Network: mainnet or sepolia', 'mainnet')
  .option('--dry-run', 'Log detections without submitting transactions', false)
  .option('--auto-report', 'Automatically report detected tokens onchain', false)
  .option('--registry <address>', 'Override Registry contract address')
  .action(async (opts) => {
    const config = resolveConfig(opts.network, opts.registry);
    const reporterConfig = resolveReporterConfig(config, opts.dryRun || !opts.autoReport);

    console.log(chalk.cyan(`\ntethics Watcher v${VERSION} - Historical Scan`));
    console.log(chalk.gray(`Network: ${config.network}  |  Registry: ${config.registry}\n`));

    const client = createPublicClient({
      chain: makeChain(config.rpcUrl, config.chainId),
      transport: http(config.rpcUrl),
    });

    const fromBlock = BigInt(opts.fromBlock);
    const toBlock = opts.toBlock ? BigInt(opts.toBlock) : await client.getBlockNumber();

    console.log(chalk.gray(`Scanning blocks ${fromBlock} → ${toBlock}…\n`));

    const projects = await fetchRegisteredProjects(config);
    console.log(chalk.green(`Loaded ${projects.length} registered projects`));

    const events = await scanHistoricalPools(
      config.rpcUrl,
      config.chainId,
      config.uniswapV3Factory,
      config.weth,
      fromBlock,
      toBlock
    );

    console.log(chalk.gray(`Found ${events.length} token pools in range\n`));

    let detectedCount = 0;
    for (const event of events) {
      const matched = await handleNewToken(event, projects, config, reporterConfig);
      if (matched) detectedCount++;
    }

    console.log(chalk.cyan(`\nScan complete. ${detectedCount} potential impersonators detected.`));
  });

program
  .command('check <project> <token>')
  .description('Check if a specific token is authorized for a project')
  .option('--network <network>', 'Network: mainnet or sepolia', 'mainnet')
  .option('--registry <address>', 'Override Registry contract address')
  .action(async (project, token, opts) => {
    const config = resolveConfig(opts.network, opts.registry);

    const client = createPublicClient({
      chain: makeChain(config.rpcUrl, config.chainId),
      transport: http(config.rpcUrl),
    });

    try {
      const isAuth = await client.readContract({
        address: config.registry,
        abi: REGISTRY_ABI,
        functionName: 'isAuthorized',
        args: [project.toLowerCase(), token as Address],
      });

      if (isAuth) {
        console.log(chalk.green(`\nAUTHORIZED: Token ${token} is authorized by the verified founder of "${project}".`));
      } else {
        console.log(chalk.red(`\nNOT AUTHORIZED: Token ${token} has NOT been authorized by the founder of "${project}".`));
      }
    } catch (e) {
      const err = e as Error;
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

// ── Core logic ────────────────────────────────────────────────────────────────

async function handleNewToken(
  event: NewTokenEvent,
  registeredProjects: string[],
  config: ReturnType<typeof resolveConfig>,
  reporterConfig: ReporterConfig | null
): Promise<boolean> {
  const matches = findMatchingProjects(event.tokenName, event.tokenSymbol, registeredProjects);

  if (matches.length === 0) return false;

  for (const project of matches) {
    console.log(
      chalk.yellow(`\n[DETECTED] Possible impersonation of "${project}"`),
      chalk.gray(`\n  Token:   ${event.tokenAddress}`),
      chalk.gray(`\n  Name:    ${event.tokenName}`),
      chalk.gray(`\n  Symbol:  ${event.tokenSymbol}`),
      chalk.gray(`\n  Block:   ${event.blockNumber}`),
      chalk.gray(`\n  Tx:      ${event.txHash}`),
      chalk.gray(`\n  Source:  ${event.source}`)
    );

    // Check if actually unauthorized
    const isAuth = await checkIsAuthorized(
      config.rpcUrl,
      config.chainId,
      config.registry,
      project,
      event.tokenAddress
    );

    if (isAuth) {
      console.log(chalk.green(`  -> AUTHORIZED (this is the official token, no action needed)`));
      continue;
    }

    console.log(chalk.red(`  -> UNAUTHORIZED`));

    if (reporterConfig) {
      try {
        const result = await reportToken(reporterConfig, project, event.tokenAddress);
        if (reporterConfig.dryRun) {
          console.log(chalk.blue(`  [DRY RUN] Would report to Registry`));
        } else {
          console.log(chalk.green(`  -> Reported! Tx: ${result.txHash}`));
        }
      } catch (e) {
        const err = e as Error;
        console.error(chalk.red(`  -> Failed to report: ${err.message}`));
      }
    } else {
      console.log(chalk.gray(`  -> Auto-report disabled. Use --auto-report to submit onchain.`));
    }
  }

  return true;
}

async function fetchRegisteredProjects(config: ReturnType<typeof resolveConfig>): Promise<string[]> {
  const client = createPublicClient({
    chain: makeChain(config.rpcUrl, config.chainId),
    transport: http(config.rpcUrl),
  });

  try {
    const logs = await client.getLogs({
      address: config.registry,
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
      fromBlock: 'earliest',
    });

    // Deduplicate project names
    const names = new Set<string>();
    for (const log of logs) {
      const name = (log.args as { name?: string }).name;
      if (name) names.add(name.toLowerCase());
    }
    return Array.from(names);
  } catch (e) {
    const err = e as Error;
    console.warn(chalk.yellow(`Warning: Could not fetch registered projects: ${err.message}`));
    return [];
  }
}

// ── Config helpers ────────────────────────────────────────────────────────────

function resolveConfig(network: string, registryOverride?: string) {
  const base = network === 'sepolia' ? BASE_SEPOLIA : BASE_MAINNET;
  return {
    ...base,
    network: network === 'sepolia' ? 'Base Sepolia' : 'Base Mainnet',
    registry: (registryOverride ?? base.registryAddress) as Address,
  };
}

function resolveReporterConfig(
  config: ReturnType<typeof resolveConfig>,
  dryRun: boolean
): ReporterConfig | null {
  const privateKey = process.env['REPORTER_PRIVATE_KEY'];
  if (!privateKey && !dryRun) {
    console.log(chalk.yellow('No REPORTER_PRIVATE_KEY set. Running in monitor-only mode.'));
    return null;
  }

  return {
    privateKey: (privateKey ?? '0x' + '0'.repeat(64)) as `0x${string}`,
    registryAddress: config.registry,
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    dryRun,
  };
}

function makeChain(rpcUrl: string, chainId: number) {
  return {
    id: chainId,
    name: chainId === 8453 ? 'Base' : 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
}

function keepAlive(): Promise<never> {
  return new Promise(() => {
    process.on('SIGINT', () => {
      console.log(chalk.cyan('\nWatcher stopped.'));
      process.exit(0);
    });
  });
}

// ── Run ───────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((e) => {
  console.error(chalk.red('Fatal:', e.message));
  process.exit(1);
});
