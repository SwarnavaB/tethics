import { VERIFICATION_STATUSES } from './constants.js';

const PROJECTS_PATH = './data/projects.json';
const ATTESTATIONS_PATH = './data/solana-attestations.json';
const REPORTS_PATH = './data/solana-reports.json';

let _projectsCache = null;
let _attestationsCache = null;
let _reportsCache = null;

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function loadProjectsRecord() {
  if (!_projectsCache) _projectsCache = await loadJson(PROJECTS_PATH);
  return _projectsCache;
}

export async function loadSolanaAttestationsRecord() {
  if (!_attestationsCache) _attestationsCache = await loadJson(ATTESTATIONS_PATH);
  return _attestationsCache;
}

export async function loadSolanaReportsRecord() {
  if (!_reportsCache) _reportsCache = await loadJson(REPORTS_PATH);
  return _reportsCache;
}

export function clearRecordsCache() {
  _projectsCache = null;
  _attestationsCache = null;
  _reportsCache = null;
}

export async function listProjectRecords() {
  const record = await loadProjectsRecord();
  return Array.isArray(record.projects) ? record.projects : [];
}

export async function findProjectRecordBySlug(slug) {
  const projects = await listProjectRecords();
  const normalized = normalizeSlug(slug);
  return projects.find((project) => normalizeSlug(project.slug) === normalized) || null;
}

export async function listRecentSolanaReports(limit = 10) {
  const record = await loadSolanaReportsRecord();
  const reports = Array.isArray(record.reports) ? record.reports : [];
  return [...reports]
    .sort((a, b) => String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')))
    .slice(0, limit);
}

export async function listProjectSummaries() {
  const projects = await listProjectRecords();
  const attestations = (await loadSolanaAttestationsRecord()).attestations || [];
  const reports = (await loadSolanaReportsRecord()).reports || [];

  return projects.map((project) => {
    const projectAttestations = attestations.filter((entry) => normalizeSlug(entry?.subject?.slug) === normalizeSlug(project.slug));
    const projectReports = reports.filter((entry) => normalizeSlug(entry?.slugHint) === normalizeSlug(project.slug));

    return {
      project,
      attestations: projectAttestations,
      reports: projectReports,
      latestAttestation: projectAttestations.sort((a, b) => String(b.issuedAt || '').localeCompare(String(a.issuedAt || '')))[0] || null,
      latestReport: projectReports.sort((a, b) => String(b.detectedAt || '').localeCompare(String(a.detectedAt || '')))[0] || null,
    };
  });
}

export async function getRecordsStats() {
  const projects = await listProjectRecords();
  const attestationRecord = await loadSolanaAttestationsRecord();
  const reportRecord = await loadSolanaReportsRecord();
  const attestations = Array.isArray(attestationRecord.attestations) ? attestationRecord.attestations : [];
  const reports = Array.isArray(reportRecord.reports) ? reportRecord.reports : [];

  return {
    projectCount: projects.length,
    approvedProjectCount: projects.filter((project) => project.status === 'APPROVED').length,
    attestationCount: attestations.length,
    reportCount: reports.length,
    unauthorizedCount: reports.filter((report) => report.status === VERIFICATION_STATUSES.UNAUTHORIZED).length,
    pendingReviewCount: reports.filter((report) => report.status === VERIFICATION_STATUSES.PENDING_REVIEW).length,
  };
}

export async function verifySolanaMint(mint) {
  const attestationRecord = await loadSolanaAttestationsRecord();
  const reportRecord = await loadSolanaReportsRecord();
  const attestations = Array.isArray(attestationRecord.attestations) ? attestationRecord.attestations : [];
  const reports = Array.isArray(reportRecord.reports) ? reportRecord.reports : [];

  const relevantAttestations = attestations.filter((attestation) => attestation?.subject?.mint === mint);
  const relevantReports = reports.filter((report) => report?.assetAddress === mint);

  const attestation = prioritizeAttestations(relevantAttestations)[0] || null;
  const report = prioritizeReports(relevantReports)[0] || null;

  if (!attestation && !report) {
    return {
      status: VERIFICATION_STATUSES.UNKNOWN,
      project: null,
      attestation: null,
      report: null,
    };
  }

  const slug = attestation?.subject?.slug || report?.slugHint;
  const project = slug ? await findProjectRecordBySlug(slug) : null;

  if (report && report.status === VERIFICATION_STATUSES.UNAUTHORIZED) {
    return {
      status: VERIFICATION_STATUSES.UNAUTHORIZED,
      project,
      attestation,
      report,
    };
  }

  if (report && report.status === VERIFICATION_STATUSES.PENDING_REVIEW) {
    return {
      status: VERIFICATION_STATUSES.PENDING_REVIEW,
      project,
      attestation,
      report,
    };
  }

  if (attestation) {
    return {
      status: statusFromAttestationType(attestation.type),
      project,
      attestation,
      report,
    };
  }

  return {
    status: report?.status || VERIFICATION_STATUSES.UNKNOWN,
    project,
    attestation,
    report,
  };
}

export async function findSolanaProjectByCreatorWallet(wallet) {
  const projects = await listProjectRecords();
  const normalizedWallet = String(wallet || '').trim();

  return projects.find((project) =>
    (project.chainProfiles || []).some((profile) =>
      (profile.launchWallets || []).some((entry) => entry.address === normalizedWallet) ||
      (profile.venueProfiles || []).some((entry) => (entry.creatorWallets || []).includes(normalizedWallet))
    )
  ) || null;
}

function prioritizeAttestations(attestations) {
  const priority = {
    REVOCATION: 5,
    UNAUTHORIZED_MINT: 4,
    AUTHORIZED_MINT: 3,
    AUTHORIZED_LAUNCH_WALLET: 2,
    PROJECT_APPROVAL: 1,
  };

  return [...attestations].sort((a, b) => {
    const pa = priority[a.type] || 0;
    const pb = priority[b.type] || 0;
    if (pb !== pa) return pb - pa;
    return String(b.issuedAt || '').localeCompare(String(a.issuedAt || ''));
  });
}

function prioritizeReports(reports) {
  const priority = {
    [VERIFICATION_STATUSES.UNAUTHORIZED]: 3,
    [VERIFICATION_STATUSES.PENDING_REVIEW]: 2,
    [VERIFICATION_STATUSES.AUTHORIZED]: 1,
  };

  return [...reports].sort((a, b) => {
    const pa = priority[a.status] || 0;
    const pb = priority[b.status] || 0;
    if (pb !== pa) return pb - pa;
    return String(b.detectedAt || '').localeCompare(String(a.detectedAt || ''));
  });
}

function statusFromAttestationType(type) {
  switch (type) {
    case 'AUTHORIZED_MINT':
    case 'AUTHORIZED_LAUNCH_WALLET':
      return VERIFICATION_STATUSES.AUTHORIZED;
    case 'UNAUTHORIZED_MINT':
      return VERIFICATION_STATUSES.UNAUTHORIZED;
    case 'REVOCATION':
      return VERIFICATION_STATUSES.REVOKED;
    default:
      return VERIFICATION_STATUSES.UNKNOWN;
  }
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
