import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectRecord, UnauthorizedReport } from './shared.js';

const DEFAULT_PROJECTS_PATH = resolve(process.cwd(), 'frontend/data/projects.json');
const DEFAULT_REPORTS_PATH = resolve(process.cwd(), 'frontend/data/solana-reports.json');

export async function loadProjectsFromRecords(path = DEFAULT_PROJECTS_PATH): Promise<ProjectRecord[]> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as { projects?: ProjectRecord[] };
  return Array.isArray(raw.projects) ? raw.projects : [];
}

export async function writeReportsToRecords(reports: UnauthorizedReport[], path = DEFAULT_REPORTS_PATH): Promise<void> {
  const payload = {
    version: 1,
    reports,
  };
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

export function getDefaultProjectsPath(): string {
  return DEFAULT_PROJECTS_PATH;
}

export function getDefaultReportsPath(): string {
  return DEFAULT_REPORTS_PATH;
}
