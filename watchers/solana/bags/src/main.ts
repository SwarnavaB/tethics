#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BagsClient } from './client.js';
import { normalizeBagsLaunch, normalizeCreatorLookup } from './normalize.js';
import { evaluateLaunch } from './pipeline.js';
import { getDefaultProjectsPath, getDefaultReportsPath, loadProjectsFromRecords, writeReportsToRecords } from './records.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'recheck') {
    const launchFile = getArgValue(args, '--launch-file');
    if (!launchFile) throw new Error('Missing required --launch-file');

    const projectsPath = getArgValue(args, '--projects') || getDefaultProjectsPath();
    const outputPath = getArgValue(args, '--output-file') || getDefaultReportsPath();

    const launch = normalizeBagsLaunch(JSON.parse(await readFile(resolve(launchFile), 'utf8')));
    const projects = await loadProjectsFromRecords(projectsPath);
    const reports = evaluateLaunch(launch, projects);

    await writeReportsToRecords(reports, outputPath);
    console.log(JSON.stringify({ launch, reports, outputPath }, null, 2));
    return;
  }

  if (command === 'mint') {
    const mint = getArgValue(args, '--mint');
    if (!mint) throw new Error('Missing required --mint');

    const projectsPath = getArgValue(args, '--projects') || getDefaultProjectsPath();
    const outputPath = getArgValue(args, '--output-file') || getDefaultReportsPath();

    const client = new BagsClient({
      apiKey: process.env['BAGS_API_KEY'],
    });

    const creatorLookup = normalizeCreatorLookup(await client.getTokenCreators(mint));
    const launch = normalizeBagsLaunch({
      mint,
      creatorWallet: creatorLookup.wallet,
      provider: creatorLookup.provider,
      providerUsername: creatorLookup.username,
      tokenName: getArgValue(args, '--token-name'),
      tokenSymbol: getArgValue(args, '--token-symbol'),
      url: getArgValue(args, '--url'),
    });

    const projects = await loadProjectsFromRecords(projectsPath);
    const reports = evaluateLaunch(launch, projects);

    await writeReportsToRecords(reports, outputPath);
    console.log(JSON.stringify({ launch, creatorLookup, reports, outputPath }, null, 2));
    return;
  }

  printUsage();
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printUsage() {
  console.log(`Usage:
  node dist/main.js recheck --launch-file <path> [--projects <path>] [--output-file <path>]
  node dist/main.js mint --mint <address> [--token-name <name>] [--token-symbol <symbol>] [--url <bags-url>] [--projects <path>] [--output-file <path>]`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
