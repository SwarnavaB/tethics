import {
  getAccount,
  isAuthorized,
  getProjectInfo,
  registerProject,
  authorizeToken,
  revokeToken,
  reportUnauthorizedToken,
  deployShield,
  getRecentReports,
  getRecentRegistrations,
  getRecentSubmissions,
  getRegistryOwner,
  getRecentApproverEvents,
  getRecentCharityManagerEvents,
  getRecentOwnershipTransfers,
  isRegistryApprover,
  isCharityCatalogManager,
  getPendingInfo,
  approveRegistration,
  rejectRegistration,
  addApprover,
  addCharityOption,
  addCharityManager,
  removeApprover,
  transferRegistryOwnership,
  listCharityOptions,
  submitExternalClaim,
  reviewExternalClaim,
  getRecentExternalClaims,
  getRecentExternalClaimReviews,
  getRecentExternalAssetAuthorizations,
  getRecentExternalAssetRevocations,
  removeCharityManager,
  updateCharityOption,
  hashExternalClaimPayload,
  normalizeName,
} from './registry.js';
import { getShieldBalance, getCharityDrainLogs } from './shield.js';
import {
  DEFAULT_CHAIN,
  DEFAULT_SOLANA_CHAIN,
  getChainDeploymentStatus,
  PROOF_LABELS,
  PROOF_TYPES,
  VERIFICATION_STATUSES,
} from './constants.js';
import {
  findProjectRecordBySlug,
  getRecordsStats,
  listProjectRecords,
  listProjectSummaries,
  listRecentSolanaReports,
  verifySolanaMint,
} from './records.js';
import { prettyPrintArtifact, verifyArtifactIntegrity } from './artifacts.js';
import {
  IPFS_PROVIDER_PRESETS,
  loadIpfsSettings,
  saveIpfsSettings,
  uploadJsonArtifact,
} from './ipfs.js';
import { renderVerificationBadge } from './status.js';
import {
  getSolanaProgramStatus,
  getSolanaProgramState,
  rotateSolanaRootAuthority,
  reviewSolanaProjectProposal,
  setSolanaProgramPause,
  submitSolanaProjectProposal,
  updateSolanaApproverRole,
  updateSolanaAssetRecord,
} from './solana-program.js';

function $(id) { return document.getElementById(id); }

const CURATOR_HANDLE = 'swarnava.sol';

function shortAddr(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerLink(addrOrTx) {
  return `${DEFAULT_CHAIN.blockExplorer}/address/${addrOrTx}`;
}

function txExplorerLink(txHash) {
  return `${DEFAULT_CHAIN.blockExplorer}/tx/${txHash}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = typeof value === 'bigint' ? new Date(Number(value) * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeExternalHref(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (raw.startsWith('ipfs://')) {
    return escapeHtml(raw);
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return escapeHtml(parsed.toString());
    }
  } catch {
    return '';
  }

  return '';
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function downloadJson(filename, payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function textToHex(value) {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes).map((entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

function setLoading(id, message = 'Loading…') {
  const container = $(id);
  if (container) {
    container.innerHTML = `<div class="spinner"></div><p class="loading-msg">${escapeHtml(message)}</p>`;
  }
}

function renderError(id, message) {
  const container = $(id);
  if (container) container.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
}

function renderKpi(label, value, hint = '') {
  return `
    <div class="kpi-card">
      <span class="kpi-label">${escapeHtml(label)}</span>
      <strong class="kpi-value">${escapeHtml(value)}</strong>
      ${hint ? `<span class="kpi-hint">${escapeHtml(hint)}</span>` : ''}
    </div>
  `;
}

function renderMetaList(items) {
  return `
    <div class="meta-grid">
      ${items.map((item) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(item.label)}</span>
          <span class="meta-value">${item.value}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function sortLogsByChainOrder(entries) {
  return [...entries].sort((a, b) => {
    const blockA = Number(a.blockNumber || 0n);
    const blockB = Number(b.blockNumber || 0n);
    if (blockA !== blockB) return blockA - blockB;
    return Number(a.logIndex || 0) - Number(b.logIndex || 0);
  });
}

function deriveActiveAddresses(addedLogs, removedLogs, addressField) {
  const active = new Map();
  for (const entry of sortLogsByChainOrder([...(addedLogs || []), ...(removedLogs || [])])) {
    const address = entry.args?.[addressField];
    if (!address) continue;
    const key = address.toLowerCase();
    const isRemoved = String(entry.eventName || '').toLowerCase().includes('removed');
    if (isRemoved) active.delete(key);
    else active.set(key, address);
  }
  return [...active.values()];
}

function renderDeploymentNotice() {
  const status = getChainDeploymentStatus(DEFAULT_CHAIN);
  if (status.configured) return '';

  return `
    <div class="error-box">
      <strong>${escapeHtml(status.chainName)} deployment is not configured in the frontend yet.</strong>
      <div class="muted">Missing: ${escapeHtml(status.missing.join(', '))}. Update <code>frontend/js/constants.js</code> after deploying the upgraded registry and shield factory.</div>
    </div>
  `;
}

function renderSolanaDeploymentNotice() {
  const status = getSolanaProgramStatus(DEFAULT_SOLANA_CHAIN);
  if (status.configured) return '';

  return `
    <div class="error-box">
      <strong>${escapeHtml(status.chainName)} registry program is not configured in the frontend yet.</strong>
      <div class="muted">Missing: ${escapeHtml(status.missing.join(', '))}. Update <code>frontend/js/constants.js</code> after deploying the Solana registry program.</div>
    </div>
  `;
}

function statusCopy(status) {
  switch (status) {
    case VERIFICATION_STATUSES.AUTHORIZED:
      return 'Positive authorization record exists.';
    case VERIFICATION_STATUSES.UNAUTHORIZED:
      return 'Public negative determination exists. Treat the asset as unauthorized.';
    case VERIFICATION_STATUSES.PENDING_REVIEW:
      return 'The launch is suspicious and still under review.';
    case VERIFICATION_STATUSES.REVOKED:
      return 'A prior record exists but is no longer active.';
    default:
      return 'No authoritative record exists yet.';
  }
}

let _account = null;
let _solanaAccount = null;
let _solanaWalletLabel = null;
let _solanaWalletProof = null;

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function detectSolanaProvider() {
  const candidates = [
    { provider: window.phantom?.solana, label: 'Phantom' },
    { provider: window.backpack?.solana, label: 'Backpack' },
    { provider: window.solflare, label: 'Solflare' },
    { provider: window.solana, label: window.solana?.isPhantom ? 'Phantom' : window.solana?.isBackpack ? 'Backpack' : window.solana?.isSolflare ? 'Solflare' : 'Solana Wallet' },
  ];

  for (const candidate of candidates) {
    if (candidate.provider?.isPhantom || candidate.provider?.isBackpack || candidate.provider?.isSolflare || candidate.provider?.connect) {
      return candidate;
    }
  }

  return { provider: null, label: null };
}

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error('No EVM wallet detected');
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    _account = await getAccount();
    renderWalletStatus();
    return _account;
  } catch (error) {
    toast(error.message, 'error');
    return null;
  }
}

async function connectSolanaWallet() {
  try {
    const { provider, label } = detectSolanaProvider();
    if (!provider) throw new Error('No Solana wallet detected. Install Phantom, Backpack, or Solflare.');
    const response = await provider.connect();
    _solanaAccount = response?.publicKey?.toString?.() || provider.publicKey?.toString?.() || null;
    _solanaWalletLabel = label || 'Solana Wallet';
    if (!_solanaAccount) throw new Error('Solana wallet connected but no public key was returned.');
    if (_solanaWalletProof?.address !== _solanaAccount) _solanaWalletProof = null;
    renderWalletStatus();
    return _solanaAccount;
  } catch (error) {
    toast(error.message, 'error');
    return null;
  }
}

async function signSolanaWalletProof(slug, displayName) {
  const { provider, label } = detectSolanaProvider();
  if (!provider) throw new Error('No Solana wallet detected.');
  const address = _solanaAccount || await connectSolanaWallet();
  if (!address) throw new Error('Connect a Solana wallet first.');
  if (typeof provider.signMessage !== 'function') {
    throw new Error(`${label || 'This wallet'} does not support message signing in this browser.`);
  }

  const signedAt = new Date().toISOString();
  const message = [
    'tethics:founder-proposal',
    `slug:${slug}`,
    `display_name:${displayName}`,
    `wallet:${address}`,
    `signed_at:${signedAt}`,
  ].join('\n');
  const encoded = new TextEncoder().encode(message);
  const signature = await provider.signMessage(encoded, 'utf8');
  const signatureBytes = signature?.signature || signature;

  if (!(signatureBytes instanceof Uint8Array)) {
    throw new Error('Solana wallet returned an unsupported signature format.');
  }

  _solanaWalletProof = {
    scheme: 'solana:signMessage',
    walletProvider: label || 'Solana Wallet',
    address,
    signedAt,
    message,
    signature: bytesToBase64(signatureBytes),
    encoding: 'base64',
  };
  renderWalletStatus();
  return _solanaWalletProof;
}

function renderWalletStatus() {
  const evmBtn = $('connect-btn');
  if (evmBtn) {
    const label = evmBtn.querySelector('span') || evmBtn;
    label.textContent = _account ? `EVM ${shortAddr(_account)}` : 'Connect EVM Wallet';
  }

  const solBtn = $('connect-solana-btn');
  if (solBtn) {
    const label = solBtn.querySelector('span') || solBtn;
    label.textContent = _solanaAccount ? `SOL ${shortAddr(_solanaAccount)}` : 'Connect Solana Wallet';
  }

  const dashEvmBtn = $('dash-connect-btn');
  if (dashEvmBtn) dashEvmBtn.textContent = _account ? `EVM ${shortAddr(_account)}` : 'Connect EVM Wallet';

  const dashSolBtn = $('dash-connect-solana-btn');
  if (dashSolBtn) dashSolBtn.textContent = _solanaAccount ? `SOL ${shortAddr(_solanaAccount)}` : 'Connect Solana Wallet';

  const registerEvmChip = $('register-evm-wallet-chip');
  if (registerEvmChip) {
    registerEvmChip.className = `wallet-chip ${_account ? 'is-connected' : 'is-missing'}`;
    registerEvmChip.innerHTML = `<strong>EVM</strong><code>${escapeHtml(_account || 'Not connected')}</code>`;
  }

  const registerSolChip = $('register-solana-wallet-chip');
  if (registerSolChip) {
    registerSolChip.className = `wallet-chip ${_solanaAccount ? 'is-connected' : 'is-missing'}`;
    registerSolChip.innerHTML = `<strong>Solana</strong><code>${escapeHtml(_solanaAccount || 'Not connected')}</code>`;
  }

  const proofChip = $('register-solana-proof-chip');
  if (proofChip) {
    proofChip.className = `wallet-chip ${_solanaWalletProof ? 'is-connected' : 'is-missing'}`;
    proofChip.innerHTML = `<strong>Proof</strong><code>${escapeHtml(_solanaWalletProof ? `Signed via ${_solanaWalletProof.walletProvider}` : 'No wallet proof yet')}</code>`;
  }
}

const routes = {
  '': renderHome,
  'verify': renderVerify,
  'verify-solana': renderVerify,
  'register': renderRegister,
  'dashboard': renderDashboard,
  'governance': renderGovernance,
  'leaderboard': renderLeaderboard,
};

function getRoute() {
  const hash = window.location.hash.slice(1) || '';
  const parts = hash.split('/').filter(Boolean);
  return { page: parts[0] || '', param: parts[1] || '' };
}

async function router() {
  const main = $('main-content');
  if (!main) return;

  const { page, param } = getRoute();
  document.querySelectorAll('nav a').forEach((link) => {
    const href = link.getAttribute('href');
    link.classList.toggle(
      'active',
      href === `#/${page}` || (page === '' && href === '#/'),
    );
  });

  const render = routes[page];
  if (!render) {
    main.innerHTML = '<div class="error-box">Page not found.</div>';
    return;
  }

  main.innerHTML = '';
  await render(main, param, page);
}

async function renderHome(container) {
  const [stats, projectSummaries, recentReports] = await Promise.all([
    getRecordsStats(),
    listProjectSummaries(),
    listRecentSolanaReports(5),
  ]);

  container.innerHTML = `
    ${renderDeploymentNotice()}
    <section class="hero hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">TETHICS Protocol</p>
        <h1>Cross-chain token legitimacy for founders, reviewers, and the public.</h1>
        <p class="hero-sub">TETHICS publishes founder-approved token records, native Solana approvals, and venue-aware warning signals for launches on Base, Solana, and Bags.</p>
        <div class="hero-actions">
          <a href="#/verify" class="btn btn-primary">Verify Any Asset</a>
          <a href="#/governance" class="btn btn-secondary">Open Governance</a>
          <a href="#/register" class="btn btn-secondary">Founder Onboarding</a>
        </div>
      </div>
      <aside class="hero-panel">
        <div class="hero-panel-inner">
          <span class="eyebrow">Operating Layer</span>
          <ul class="signal-list">
            <li>Base registry under the <code>tethics.eth</code> governance root</li>
            <li>Native Solana registry under the <code>tethics.sol</code> authority path</li>
            <li>DAO-ready review delegation and scoped charity routing governance</li>
            <li>Public evidence bundles and transparent governance surfaces</li>
          </ul>
        </div>
      </aside>
    </section>

    <section class="kpi-grid">
      ${renderKpi('Projects', stats.projectCount, `${stats.approvedProjectCount} approved`)}
      ${renderKpi('Solana Attestations', stats.attestationCount)}
      ${renderKpi('Live Report Records', stats.reportCount)}
      ${renderKpi('Pending Review', stats.pendingReviewCount)}
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <p class="eyebrow">Verification</p>
          <h2>One place to check Base contracts and Solana mints</h2>
        </div>
      </div>
      <div class="dual-verify-grid">
        <div class="card accent-card">
          <h3>EVM Verification</h3>
          <p class="card-copy">Query the Base registry for founder-approved ERC-20 contracts and shield state.</p>
          <a href="#/verify" class="btn btn-primary">Open EVM Verify</a>
        </div>
        <div class="card accent-card">
          <h3>Solana Verification</h3>
          <p class="card-copy">Read signed attestation records and Bags-linked review output for suspicious mints.</p>
          <a href="#/verify-solana" class="btn btn-primary">Open Solana Verify</a>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <p class="eyebrow">Governance</p>
          <h2>Built for transparent delegation over time</h2>
        </div>
      </div>
      <div class="dual-verify-grid">
        <div class="card governance-panel">
          <h3>Protocol Governance</h3>
          <p class="card-copy">Track EVM root custody, delegated approvers, charity managers, Solana native approvers, and emergency state from a dedicated operator UI.</p>
          <a href="#/governance" class="btn btn-primary">Open Governance</a>
        </div>
        <div class="card governance-panel">
          <h3>Reviewer Operations</h3>
          <p class="card-copy">Use the dashboard for founder workflows, pending reviews, native Solana proposals, and asset-level authorization decisions.</p>
          <a href="#/dashboard" class="btn btn-secondary">Open Dashboard</a>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <p class="eyebrow">Protected Projects</p>
          <h2>Current curated set</h2>
        </div>
      </div>
      <div class="project-stack">
        ${projectSummaries.length === 0
          ? '<div class="info-box">No curated projects have been published yet.</div>'
          : projectSummaries.map(({ project, latestAttestation, latestReport }) => `
              <article class="card project-listing">
                <div class="project-header-row">
                  <div>
                    <h3>${escapeHtml(project.displayName)}</h3>
                    <p class="muted">${escapeHtml(project.description || 'No project description yet.')}</p>
                  </div>
                  ${renderVerificationBadge(
                    latestReport?.status || latestAttestation ? VERIFICATION_STATUSES.AUTHORIZED : VERIFICATION_STATUSES.UNKNOWN,
                    latestReport?.status === VERIFICATION_STATUSES.PENDING_REVIEW
                      ? 'Latest Solana signal is pending review.'
                      : latestReport?.status === VERIFICATION_STATUSES.UNAUTHORIZED
                        ? 'Latest Solana signal is unauthorized.'
                        : 'Approved project record is published.',
                  )}
                </div>
                ${renderMetaList([
                  { label: 'Slug', value: escapeHtml(project.slug) },
                  { label: 'Website', value: safeExternalHref(project.website) ? `<a href="${safeExternalHref(project.website)}" target="_blank" rel="noopener">${escapeHtml(project.website)}</a>` : '—' },
                  { label: 'Latest Attestation', value: latestAttestation ? escapeHtml(latestAttestation.type) : '—' },
                  { label: 'Latest Report', value: latestReport ? escapeHtml(latestReport.status) : '—' },
                ])}
              </article>
            `).join('')}
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <p class="eyebrow">Review Feed</p>
          <h2>Latest Solana and Bags records</h2>
        </div>
      </div>
      <div class="report-feed">
        ${recentReports.length === 0
          ? '<div class="info-box">No Solana reports have been published yet.</div>'
          : recentReports.map((report) => `
              <article class="card feed-card">
                <div class="feed-header">
                  <strong>${escapeHtml(report.slugHint || 'Unknown project')}</strong>
                  ${renderVerificationBadge(report.status, `Confidence ${report.confidence}`)}
                </div>
                ${renderMetaList([
                  { label: 'Mint', value: `<code>${escapeHtml(report.assetAddress)}</code>` },
                  { label: 'Venue', value: escapeHtml(report.venue || 'BAGS') },
                  { label: 'Creator Wallet', value: report.creatorWallet ? `<code>${escapeHtml(report.creatorWallet)}</code>` : '—' },
                  { label: 'Detected', value: escapeHtml(formatDate(report.detectedAt)) },
                ])}
              </article>
            `).join('')}
      </div>
    </section>
  `;
}

async function renderVerify(container, param, page) {
  const isSolanaDefault = page === 'verify-solana';
  container.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Verification Console</p>
      <h1>Check an EVM contract or Solana mint</h1>
      <p class="page-sub">Use the Base registry for EVM contracts and chain-backed external asset records plus review evidence for Solana mints.</p>
    </section>

    <div class="card">
      <div class="segmented-control" id="verify-mode">
        <button class="segment ${isSolanaDefault ? '' : 'is-active'}" data-mode="evm">EVM / Base</button>
        <button class="segment ${isSolanaDefault ? 'is-active' : ''}" data-mode="solana">Solana / Bags</button>
      </div>

      <div id="verify-evm-form" class="${isSolanaDefault ? 'hidden' : ''}">
        <div class="form-group">
          <label>Project Slug</label>
          <input type="text" id="verify-project" placeholder="e.g. tethics" value="${!isSolanaDefault ? escapeHtml(param || '') : ''}" />
        </div>
        <div class="form-group">
          <label>Base Token Address</label>
          <input type="text" id="verify-token" placeholder="0x…" />
        </div>
      </div>

      <div id="verify-solana-form" class="${isSolanaDefault ? '' : 'hidden'}">
        <div class="form-group">
          <label>Solana Mint</label>
          <input type="text" id="verify-solana-mint" placeholder="So11111111111111111111111111111111111111112" value="${isSolanaDefault ? escapeHtml(param || '') : ''}" />
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="verify-btn">Run Verification</button>
      </div>
    </div>

    <div id="verify-result"></div>
    <div id="verify-report-box"></div>
  `;

  const modeRoot = $('verify-mode');
  let mode = isSolanaDefault ? 'solana' : 'evm';

  modeRoot.querySelectorAll('.segment').forEach((button) => {
    button.addEventListener('click', () => {
      mode = button.dataset.mode;
      modeRoot.querySelectorAll('.segment').forEach((entry) => entry.classList.toggle('is-active', entry === button));
      $('verify-evm-form').classList.toggle('hidden', mode !== 'evm');
      $('verify-solana-form').classList.toggle('hidden', mode !== 'solana');
    });
  });

  $('verify-btn').addEventListener('click', async () => {
    if (mode === 'solana') {
      await runSolanaVerification();
    } else {
      await runEvmVerification();
    }
  });

  if (param) {
    await (mode === 'solana' ? runSolanaVerification() : runEvmVerification());
  }

  async function runEvmVerification() {
    const name = $('verify-project').value.trim();
    const tokenAddr = $('verify-token').value.trim();
    const result = $('verify-result');
    const reportBox = $('verify-report-box');

    if (!name) {
      toast('Enter a project slug', 'error');
      return;
    }

    result.innerHTML = '<div class="spinner"></div>';
    reportBox.innerHTML = '';

    try {
      const info = await getProjectInfo(name);
      if (!info.exists) {
        result.innerHTML = renderVerificationBadge(VERIFICATION_STATUSES.UNKNOWN, `The Base registry does not contain "${normalizeName(name)}".`);
        return;
      }

      const hasShield = info.shieldContract && info.shieldContract !== '0x0000000000000000000000000000000000000000';
      const challengeOpen = Date.now() / 1000 < Number(info.challengeDeadline);
      const drainLogs = hasShield ? await getCharityDrainLogs(info.shieldContract) : [];
      const totalDrained = drainLogs.reduce((sum, entry) => sum + BigInt(entry.args.amount || 0), 0n);
      const tokenStatus = tokenAddr
        ? ((await isAuthorized(name, tokenAddr)) ? VERIFICATION_STATUSES.AUTHORIZED : VERIFICATION_STATUSES.UNAUTHORIZED)
        : VERIFICATION_STATUSES.UNKNOWN;

      result.innerHTML = `
        <article class="card result-card">
          <div class="result-head">
            <div>
              <p class="eyebrow">Base Registry Result</p>
              <h2>${escapeHtml(normalizeName(name))}</h2>
            </div>
            ${renderVerificationBadge(
              tokenAddr ? tokenStatus : VERIFICATION_STATUSES.AUTHORIZED,
              tokenAddr ? statusCopy(tokenStatus) : 'Project exists in the Base registry.',
            )}
          </div>
          ${renderMetaList([
            { label: 'Founder', value: `<a href="${explorerLink(info.founder)}" target="_blank" rel="noopener">${escapeHtml(info.founder)}</a>` },
            { label: 'Registered', value: escapeHtml(formatDate(info.registeredAt)) },
            { label: 'Challenge Window', value: challengeOpen ? 'Open' : 'Closed' },
            { label: 'Proof Count', value: escapeHtml(String(info.verificationProofs.length)) },
            { label: 'Shield', value: hasShield ? `<a href="${explorerLink(info.shieldContract)}" target="_blank" rel="noopener">${escapeHtml(info.shieldContract)}</a>` : 'Not deployed' },
            { label: 'Total Drained', value: hasShield ? `${(Number(totalDrained) / 1e18).toFixed(6)} ETH` : '—' },
          ])}
          ${tokenAddr ? `<div class="inline-code-row"><span>Checked token</span><code>${escapeHtml(tokenAddr)}</code></div>` : ''}
        </article>
      `;

      if (tokenAddr && tokenStatus === VERIFICATION_STATUSES.UNAUTHORIZED) {
        reportBox.innerHTML = `
          <div class="card danger-card">
            <h3>Report This Base Token</h3>
            <p class="card-copy">If this contract is impersonating the project, you can send an onchain report to the registry.</p>
            <button class="btn btn-danger" id="report-base-token-btn">Report to Base Registry</button>
            <div id="report-base-token-result"></div>
          </div>
        `;

        $('report-base-token-btn').addEventListener('click', async () => {
          const out = $('report-base-token-result');
          let account = _account;
          if (!account) account = await connectWallet();
          if (!account) return;

          out.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await reportUnauthorizedToken(name, tokenAddr);
            out.innerHTML = `<div class="success-box">Reported. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
          } catch (error) {
            out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
          }
        });
      }
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  }

  async function runSolanaVerification() {
    const mint = $('verify-solana-mint').value.trim();
    const result = $('verify-result');
    const reportBox = $('verify-report-box');

    if (!mint) {
      toast('Enter a Solana mint', 'error');
      return;
    }

    result.innerHTML = '<div class="spinner"></div>';
    reportBox.innerHTML = '';

    try {
      const [authorizedLogs, revokedLogs] = await Promise.all([
        getRecentExternalAssetAuthorizations('solana', 'mint', mint).catch(() => []),
        getRecentExternalAssetRevocations('solana', 'mint', mint).catch(() => []),
      ]);
      const latestAuthorized = authorizedLogs.at(-1) || null;
      const latestRevoked = revokedLogs.at(-1) || null;
      const onchainAssetStatus = latestRevoked
        ? VERIFICATION_STATUSES.REVOKED
        : latestAuthorized
          ? VERIFICATION_STATUSES.AUTHORIZED
          : VERIFICATION_STATUSES.UNKNOWN;
      const verdict = await verifySolanaMint(mint);
      const projectName = latestAuthorized?.args?.name
        || verdict.project?.displayName
        || verdict.attestation?.subject?.slug
        || verdict.report?.slugHint
        || 'Unknown project';
      const finalStatus = onchainAssetStatus !== VERIFICATION_STATUSES.UNKNOWN ? onchainAssetStatus : verdict.status;

      result.innerHTML = `
        <article class="card result-card">
          <div class="result-head">
            <div>
              <p class="eyebrow">Solana Attestation Result</p>
              <h2>${escapeHtml(projectName)}</h2>
            </div>
            ${renderVerificationBadge(finalStatus, statusCopy(finalStatus))}
          </div>
          ${renderMetaList([
            { label: 'Mint', value: `<code>${escapeHtml(mint)}</code>` },
            { label: 'Onchain Asset Record', value: latestAuthorized ? escapeHtml(latestAuthorized.args.assetType || 'MINT') : '—' },
            { label: 'Onchain Project', value: latestAuthorized?.args?.name ? escapeHtml(latestAuthorized.args.name) : '—' },
            { label: 'Onchain Status', value: escapeHtml(onchainAssetStatus) },
            { label: 'Attestation', value: verdict.attestation ? escapeHtml(verdict.attestation.type) : '—' },
            { label: 'Issued', value: escapeHtml(formatDate(verdict.attestation?.issuedAt)) },
            { label: 'Issuer', value: verdict.attestation?.issuer?.authority ? `<code>${escapeHtml(verdict.attestation.issuer.authority)}</code>` : '—' },
            { label: 'Report Status', value: escapeHtml(verdict.report?.status || '—') },
            { label: 'Detected', value: escapeHtml(formatDate(verdict.report?.detectedAt)) },
          ])}
        </article>
      `;

      if (latestAuthorized || latestRevoked) {
        reportBox.innerHTML += `
          <article class="card ${latestRevoked ? 'danger-card' : 'accent-card'}">
            <h3>Onchain Solana Asset Record</h3>
            <p class="card-copy">This mint has a first-class onchain asset record in the Base registry, giving Solana verification the same public coordination layer as EVM assets.</p>
            ${renderMetaList([
              { label: 'Authorized Block', value: latestAuthorized ? escapeHtml(String(latestAuthorized.blockNumber)) : '—' },
              { label: 'Revoked Block', value: latestRevoked ? escapeHtml(String(latestRevoked.blockNumber)) : '—' },
              { label: 'Metadata URI', value: latestAuthorized?.args?.metadataURI ? escapeHtml(latestAuthorized.args.metadataURI) : (latestRevoked?.args?.metadataURI ? escapeHtml(latestRevoked.args.metadataURI) : '—') },
            ])}
          </article>
        `;
      }

      if (verdict.report) {
        reportBox.innerHTML += `
          <article class="card ${verdict.report.status === VERIFICATION_STATUSES.UNAUTHORIZED ? 'danger-card' : 'accent-card'}">
            <h3>Linked Bags Review Record</h3>
            <p class="card-copy">This record came from the Solana/Bags review pipeline and may include matching evidence even before a final negative attestation exists.</p>
            ${renderMetaList([
              { label: 'Venue', value: escapeHtml(verdict.report.venue || 'BAGS') },
              { label: 'Creator Wallet', value: verdict.report.creatorWallet ? `<code>${escapeHtml(verdict.report.creatorWallet)}</code>` : '—' },
              { label: 'Confidence', value: escapeHtml(String(verdict.report.confidence)) },
              { label: 'Severity', value: escapeHtml(verdict.report.severity) },
            ])}
            <div class="evidence-list">
              ${(verdict.report.evidence || []).map((item) => `
                <div class="evidence-item">
                  <strong>${escapeHtml(item.type)}</strong>
                  <p>${escapeHtml(item.summary)}</p>
                </div>
              `).join('') || '<div class="muted">No evidence attached.</div>'}
            </div>
          </article>
        `;
      }
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  }
}

async function renderRegister(container) {
  container.innerHTML = `
    ${renderDeploymentNotice()}
    ${renderSolanaDeploymentNotice()}
    <section class="page-head">
      <p class="eyebrow">Founder Onboarding</p>
      <h1>Submit a project claim, then wait for curator approval</h1>
      <p class="page-sub">Founders propose projects and proof material first. Until delegation exists, <code>${escapeHtml(CURATOR_HANDLE)}</code> reviews those claims and approves the first legitimate record set.</p>
    </section>

    <div class="wallet-toolbar">
      <div class="wallet-chip ${_account ? 'is-connected' : 'is-missing'}" id="register-evm-wallet-chip">
        <strong>EVM</strong>
        <code>${escapeHtml(_account || 'Not connected')}</code>
      </div>
      <div class="wallet-chip ${_solanaAccount ? 'is-connected' : 'is-missing'}" id="register-solana-wallet-chip">
        <strong>Solana</strong>
        <code>${escapeHtml(_solanaAccount || 'Not connected')}</code>
      </div>
      <div class="wallet-chip ${_solanaWalletProof ? 'is-connected' : 'is-missing'}" id="register-solana-proof-chip">
        <strong>Proof</strong>
        <code>${escapeHtml(_solanaWalletProof ? `Signed via ${_solanaWalletProof.walletProvider}` : 'No wallet proof yet')}</code>
      </div>
      <button class="btn btn-secondary" id="register-connect-evm-btn">${_account ? `EVM ${shortAddr(_account)}` : 'Connect EVM Wallet'}</button>
      <button class="btn btn-secondary" id="register-connect-solana-btn">${_solanaAccount ? `SOL ${shortAddr(_solanaAccount)}` : 'Connect Solana Wallet'}</button>
    </div>

    <section class="dashboard-grid">
      <article class="card accent-card">
        <p class="eyebrow">Flow</p>
        <h2>How proposals work right now</h2>
        <div class="list-stack">
          <div class="list-card">
            <strong>1. Founder submits a claim</strong>
            <p class="muted">For Base, the submission lands onchain as a pending registration. For Solana, the founder submits a proposal to the Solana registry program with a public artifact bundle.</p>
          </div>
          <div class="list-card">
            <strong>2. Curator verifies legitimacy</strong>
            <p class="muted"><code>${escapeHtml(CURATOR_HANDLE)}</code> reviews proofs, wallets, launch context, and Bags creator linkage before publishing any approval.</p>
          </div>
          <div class="list-card">
            <strong>3. Approved founders get publish rights</strong>
            <p class="muted">After approval, the project appears in the public record and founders can manage authorized assets and warning workflows.</p>
          </div>
        </div>
      </article>

      <article class="card subtle-card">
        <p class="eyebrow">Current Curator</p>
        <h2>Initial trust layer</h2>
        <p class="card-copy">This MVP is intentionally curated first. The point is to avoid fake projects entering the system before a community reputation model exists.</p>
        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Primary reviewer</span>
            <span class="meta-value"><code>${escapeHtml(CURATOR_HANDLE)}</code></span>
          </div>
          <div class="meta-item">
            <span class="meta-label">EVM role</span>
            <span class="meta-value">Registry owner / approver</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Solana role</span>
            <span class="meta-value">Root authority / approver</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Delegation path</span>
            <span class="meta-value">Approvers and community reviewers later</span>
          </div>
        </div>
      </article>
    </section>

    <div class="register-layout">
      <article class="card">
        <p class="eyebrow">Base / EVM Founder Submission</p>
        <h2>Submit a pending registry registration</h2>
        <p class="card-copy">This is the live founder proposal path already supported by the contract. Your wallet becomes the claimant, the submission stays pending, and only an approver can activate it.</p>
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="reg-name" placeholder="myproject" />
        </div>
        <div class="form-group">
          <label>Proof Builder</label>
          <div id="proof-list"></div>
          <button class="btn btn-secondary" id="add-proof-btn">Add Proof</button>
        </div>
        <button class="btn btn-primary" id="reg-submit-btn">Submit Base Registration</button>
        <div id="reg-result"></div>
      </article>

      <article class="card accent-card">
        <p class="eyebrow">Solana / Bags Founder Proposal</p>
        <h2>Build and submit a Solana registry proposal</h2>
        <p class="card-copy">This form creates the canonical Solana proposal artifact, uploads it publicly, and submits the proposal through the Solana registry program once deployed.</p>
        <div class="form-group">
          <label>Project Slug</label>
          <input type="text" id="sol-proposal-slug" placeholder="myproject" />
        </div>
        <div class="form-group">
          <label>Display Name</label>
          <input type="text" id="sol-proposal-name" placeholder="My Project" />
        </div>
        <div class="form-grid two-col">
          <div class="form-group">
            <label>Founder Solana Wallets</label>
            <textarea id="sol-proposal-wallets" placeholder="One wallet per line"></textarea>
          </div>
          <div class="form-group">
            <label>Bags Creator Wallets / Handles</label>
            <textarea id="sol-proposal-bags" placeholder="One wallet or handle per line"></textarea>
          </div>
        </div>
        <div class="form-grid two-col">
          <div class="form-group">
            <label>Linked EVM Wallets</label>
            <textarea id="sol-proposal-evm-wallets" placeholder="Optional, one wallet per line"></textarea>
          </div>
          <div class="form-group">
            <label>Evidence Links</label>
            <textarea id="sol-proposal-links" placeholder="Website, X, GitHub, docs, launch pages"></textarea>
          </div>
        </div>
        <div class="form-group">
          <label>Review Notes</label>
          <textarea id="sol-proposal-notes" placeholder="Short explanation of the project and why these wallets are legitimate"></textarea>
        </div>
        <div class="form-group">
          <label>Public Metadata URI</label>
          <input type="text" id="sol-proposal-uri" placeholder="ipfs://... or https://... proposal package location" />
        </div>
        <div class="inline-actions">
          <button class="btn btn-secondary" id="use-solana-wallet-btn">Use Connected Solana Wallet</button>
          <button class="btn btn-secondary" id="sign-solana-proof-btn">Sign Founder Wallet Proof</button>
        </div>
        <div class="card-note">The Solana founder flow can now include a live wallet connection and a browser-signed founder proof before the proposal is submitted to the Solana registry program.</div>
        <div class="form-group">
          <label>Artifact Upload Provider</label>
          <select id="sol-proposal-ipfs-provider">
            ${Object.values(IPFS_PROVIDER_PRESETS).map((provider) => `
              <option value="${provider.id}">${escapeHtml(provider.label)}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-grid two-col">
          <div class="form-group">
            <label>Upload Endpoint</label>
            <input type="text" id="sol-proposal-ipfs-endpoint" placeholder="https://..." />
          </div>
          <div class="form-group">
            <label>Gateway Base</label>
            <input type="text" id="sol-proposal-ipfs-gateway" placeholder="https://ipfs.io/ipfs/" />
          </div>
        </div>
        <div class="form-group">
          <label>Upload Credential</label>
          <input type="text" id="sol-proposal-ipfs-token" placeholder="JWT or bearer token stored only in this browser" />
        </div>
        <div class="inline-actions">
          <button class="btn btn-primary" id="generate-sol-proposal-btn">Generate Proposal Draft</button>
          <button class="btn btn-secondary" id="download-sol-proposal-btn">Download JSON</button>
          <button class="btn btn-secondary" id="upload-sol-proposal-btn">Upload To IPFS</button>
          <button class="btn btn-secondary" id="anchor-sol-proposal-btn">Submit On Solana</button>
        </div>
        <div id="sol-proposal-result"></div>
        <div class="card-note">
          This is a founder proposal package, not an approval. Once the Solana registry program is deployed, this flow submits directly on Solana instead of routing through the EVM review path.
        </div>
      </article>
    </div>
  `;

  const proofs = [];
  let latestProposalDraft = null;
  let ipfsSettings = loadIpfsSettings();

  function renderProofList() {
    const list = $('proof-list');
    list.innerHTML = proofs.length === 0
      ? '<div class="info-box">No proofs added yet. Add at least two proof categories before submitting.</div>'
      : proofs.map((proof, index) => `
          <div class="proof-row">
            <span class="proof-type-label">${escapeHtml(PROOF_LABELS[proof.proofType])}</span>
            <span class="proof-data-preview">${escapeHtml(proof.dataPreview || '(data set)')}</span>
            <button class="btn btn-sm btn-danger" data-remove-proof="${index}">Remove</button>
          </div>
        `).join('');

    list.querySelectorAll('[data-remove-proof]').forEach((button) => {
      button.addEventListener('click', () => {
        proofs.splice(Number(button.dataset.removeProof), 1);
        renderProofList();
      });
    });
  }

  renderProofList();
  renderWalletStatus();

  $('add-proof-btn').addEventListener('click', () => {
    const typeStr = prompt('Choose proof type:\n1 = Deployer Signature\n2 = ENS Name\n3 = DNS TXT Record\n4 = GitHub Gist URL\n5 = Contract Owner');
    const proofType = Number(typeStr);
    if (!proofType || !PROOF_LABELS[proofType]) {
      toast('Invalid proof type', 'error');
      return;
    }

    const data = prompt(`Enter proof data for ${PROOF_LABELS[proofType]}:`);
    if (!data) return;

    const hex = textToHex(data);
    proofs.push({ proofType, data: hex, dataPreview: data });
    renderProofList();
  });

  $('reg-submit-btn').addEventListener('click', async () => {
    const name = $('reg-name').value.trim();
    const result = $('reg-result');
    if (!name) {
      toast('Enter a project name', 'error');
      return;
    }
    if (proofs.length < 2) {
      toast('Add at least two proofs', 'error');
      return;
    }

    let account = _account;
    if (!account) account = await connectWallet();
    if (!account) return;

    result.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await registerProject(name, proofs.map((entry) => ({ proofType: entry.proofType, data: entry.data })));
      result.innerHTML = `<div class="success-box">Registration submitted. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('register-connect-evm-btn')?.addEventListener('click', async () => {
    await connectWallet();
    renderWalletStatus();
  });
  $('register-connect-solana-btn')?.addEventListener('click', async () => {
    await connectSolanaWallet();
    renderWalletStatus();
  });
  $('use-solana-wallet-btn')?.addEventListener('click', async () => {
    const wallet = _solanaAccount || await connectSolanaWallet();
    if (!wallet) return;
    const field = $('sol-proposal-wallets');
    const wallets = field.value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    if (!wallets.includes(wallet)) {
      field.value = wallets.length === 0 ? wallet : `${field.value.trim()}\n${wallet}`;
    }
    renderWalletStatus();
    toast('Connected Solana wallet added to founder wallets.');
  });
  $('sign-solana-proof-btn')?.addEventListener('click', async () => {
    const result = $('sol-proposal-result');
    try {
      const slug = normalizeName($('sol-proposal-slug').value.trim());
      const displayName = $('sol-proposal-name').value.trim();
      if (!slug || !displayName) throw new Error('Enter a slug and display name before signing.');
      result.innerHTML = '<div class="spinner"></div>';
      const proof = await signSolanaWalletProof(slug, displayName);
      result.innerHTML = `
        <div class="success-box">Founder wallet proof signed in-browser.</div>
        ${renderMetaList([
          { label: 'Wallet', value: `<code>${escapeHtml(proof.address)}</code>` },
          { label: 'Provider', value: escapeHtml(proof.walletProvider) },
          { label: 'Signed at', value: escapeHtml(formatDate(proof.signedAt)) },
        ])}
        <pre class="code-block">${escapeHtml(prettyPrintArtifact(proof))}</pre>
      `;
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  });

  function syncIpfsSettingsFromForm() {
    const provider = $('sol-proposal-ipfs-provider').value;
    const preset = IPFS_PROVIDER_PRESETS[provider] || IPFS_PROVIDER_PRESETS.pinata;
    ipfsSettings = {
      provider,
      endpoint: $('sol-proposal-ipfs-endpoint').value.trim() || preset.endpoint,
      token: $('sol-proposal-ipfs-token').value.trim(),
      gateway: $('sol-proposal-ipfs-gateway').value.trim() || 'https://ipfs.io/ipfs/',
    };
    saveIpfsSettings(ipfsSettings);
    return ipfsSettings;
  }

  function hydrateIpfsSettingsForm() {
    $('sol-proposal-ipfs-provider').value = ipfsSettings.provider;
    $('sol-proposal-ipfs-endpoint').value = ipfsSettings.endpoint;
    $('sol-proposal-ipfs-token').value = ipfsSettings.token;
    $('sol-proposal-ipfs-gateway').value = ipfsSettings.gateway;
  }

  hydrateIpfsSettingsForm();

  $('sol-proposal-ipfs-provider').addEventListener('change', () => {
    const provider = $('sol-proposal-ipfs-provider').value;
    const preset = IPFS_PROVIDER_PRESETS[provider] || IPFS_PROVIDER_PRESETS.pinata;
    if (!$('sol-proposal-ipfs-endpoint').value.trim() || $('sol-proposal-ipfs-endpoint').value === ipfsSettings.endpoint) {
      $('sol-proposal-ipfs-endpoint').value = preset.endpoint;
    }
    syncIpfsSettingsFromForm();
  });

  ['sol-proposal-ipfs-endpoint', 'sol-proposal-ipfs-token', 'sol-proposal-ipfs-gateway'].forEach((id) => {
    $(id).addEventListener('change', syncIpfsSettingsFromForm);
  });

  function buildSolanaProposalDraft() {
    const slug = normalizeName($('sol-proposal-slug').value.trim());
    const displayName = $('sol-proposal-name').value.trim();
    const founderWallets = $('sol-proposal-wallets').value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    const bagsCreators = $('sol-proposal-bags').value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    const evmWallets = $('sol-proposal-evm-wallets').value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    const evidenceLinks = $('sol-proposal-links').value.split('\n').map((entry) => entry.trim()).filter(Boolean);
    const notes = $('sol-proposal-notes').value.trim();
    const metadataURI = $('sol-proposal-uri').value.trim();

    if (!slug || !displayName) throw new Error('Enter a slug and display name');
    if (founderWallets.length === 0) throw new Error('Add at least one Solana founder wallet');

    return {
      version: '0.1',
      kind: 'PROJECT_PROPOSAL',
      submittedAt: new Date().toISOString(),
      reviewer: CURATOR_HANDLE,
      submitter: {
        evmWallet: _account || null,
        solanaWallet: _solanaAccount || null,
      },
      project: {
        slug,
        displayName,
        ecosystems: ['SOLANA'],
      },
      solana: {
        founderWallets,
        bagsCreators,
      },
      links: evidenceLinks,
      linkedEvmWallets: evmWallets,
      metadataURI,
      notes,
      proofs: {
        solanaWalletOwnership: _solanaWalletProof && founderWallets.includes(_solanaWalletProof.address)
          ? _solanaWalletProof
          : null,
      },
    };
  }

  function renderProposalDraft() {
    const result = $('sol-proposal-result');
    try {
      latestProposalDraft = buildSolanaProposalDraft();
      const payloadHash = hashExternalClaimPayload(latestProposalDraft);
      result.innerHTML = `
        <div class="success-box">Proposal draft generated. Review it, then send it for curator review.</div>
        <div class="card-note">Payload hash: <code>${escapeHtml(payloadHash)}</code></div>
        <pre class="code-block">${escapeHtml(prettyPrintArtifact(latestProposalDraft))}</pre>
      `;
    } catch (error) {
      latestProposalDraft = null;
      result.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  }

  $('generate-sol-proposal-btn').addEventListener('click', renderProposalDraft);
  $('download-sol-proposal-btn').addEventListener('click', () => {
    try {
      if (!latestProposalDraft) latestProposalDraft = buildSolanaProposalDraft();
      downloadJson(`${latestProposalDraft.project.slug}.proposal.json`, latestProposalDraft);
      $('sol-proposal-result').innerHTML = '<div class="success-box">Proposal JSON downloaded.</div>';
    } catch (error) {
      $('sol-proposal-result').innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  });

  $('upload-sol-proposal-btn').addEventListener('click', async () => {
    const result = $('sol-proposal-result');
    try {
      if (!latestProposalDraft) latestProposalDraft = buildSolanaProposalDraft();
      const settings = syncIpfsSettingsFromForm();
      result.innerHTML = '<div class="spinner"></div>';
      const upload = await uploadJsonArtifact({
        artifact: latestProposalDraft,
        fileName: `${latestProposalDraft.project.slug}.proposal.json`,
        settings,
      });

      $('sol-proposal-uri').value = upload.uri;
      latestProposalDraft = {
        ...latestProposalDraft,
        metadataURI: upload.uri,
      };

      const payloadHash = hashExternalClaimPayload(latestProposalDraft);
      result.innerHTML = `
        <div class="success-box">Artifact uploaded via ${escapeHtml(upload.provider)}.</div>
        ${renderMetaList([
          { label: 'IPFS URI', value: `<code>${escapeHtml(upload.uri)}</code>` },
          { label: 'Gateway', value: safeExternalHref(upload.gatewayUrl) ? `<a href="${safeExternalHref(upload.gatewayUrl)}" target="_blank" rel="noopener">Open artifact</a>` : '—' },
          { label: 'Payload hash', value: `<code>${escapeHtml(payloadHash)}</code>` },
        ])}
        <pre class="code-block">${escapeHtml(prettyPrintArtifact(latestProposalDraft))}</pre>
      `;
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  });

  $('anchor-sol-proposal-btn').addEventListener('click', async () => {
    const result = $('sol-proposal-result');
    try {
      if (!latestProposalDraft) latestProposalDraft = buildSolanaProposalDraft();
      const { provider } = detectSolanaProvider();
      if (!_solanaAccount) {
        const account = await connectSolanaWallet();
        if (!account) return;
      }
      if (!latestProposalDraft.metadataURI) {
        throw new Error('Enter a public metadata URI before submitting the Solana proposal');
      }

      const payloadHash = hashExternalClaimPayload(latestProposalDraft);
      result.innerHTML = '<div class="spinner"></div>';
      const submission = await submitSolanaProjectProposal({
        provider,
        proposerAddress: _solanaAccount,
        slug: latestProposalDraft.project.slug,
        displayName: latestProposalDraft.project.displayName,
        metadataHash: payloadHash,
        metadataURI: latestProposalDraft.metadataURI,
      });
      result.innerHTML = `
        <div class="success-box">Proposal submitted on Solana. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>
        ${renderMetaList([
          { label: 'Proposal Account', value: `<code>${escapeHtml(submission.proposalAddress)}</code>` },
          { label: 'Project PDA', value: `<code>${escapeHtml(submission.projectAddress)}</code>` },
          { label: 'Signature', value: `<code>${escapeHtml(submission.signature)}</code>` },
        ])}
        <div class="card-note">Payload hash: <code>${escapeHtml(payloadHash)}</code></div>
        <pre class="code-block">${escapeHtml(prettyPrintArtifact(latestProposalDraft))}</pre>
      `;
    } catch (error) {
      result.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
}

async function renderDashboard(container) {
  const solanaProgramConfigured = getSolanaProgramStatus(DEFAULT_SOLANA_CHAIN).configured;
  const [projectSummaries, reports, solanaState] = await Promise.all([
    listProjectSummaries(),
    listRecentSolanaReports(25),
    solanaProgramConfigured ? getSolanaProgramState().catch(() => null) : Promise.resolve(null),
  ]);
  const solanaConfig = solanaState?.config || null;
  const solanaApprovers = (solanaState?.approvers || []).filter((entry) => entry.active);
  const solanaProjects = solanaState?.projects || [];
  const solanaAssets = solanaState?.assets || [];
  const solanaProposals = solanaState?.proposals || [];
  const pendingSolanaProposals = solanaProposals.filter((entry) => entry.status === 'PENDING');
  const mySolanaProposals = _solanaAccount
    ? solanaProposals.filter((entry) => entry.submittedBy === _solanaAccount)
    : [];
  const isSolanaRoot = Boolean(_solanaAccount && solanaConfig?.rootAuthority && solanaConfig.rootAuthority === _solanaAccount);
  const isSolanaApprover = Boolean(_solanaAccount && solanaApprovers.some((entry) => entry.approver === _solanaAccount));
  const canReviewSolana = isSolanaRoot || isSolanaApprover;

  container.innerHTML = `
    ${renderDeploymentNotice()}
    <section class="page-head">
      <p class="eyebrow">Operations Dashboard</p>
      <h1>Founder workspace and curator review queue</h1>
      <p class="page-sub">This is the operating surface for the curated-first system: founders track submissions here, and <code>${escapeHtml(CURATOR_HANDLE)}</code> or delegated approvers review and publish legitimate projects.</p>
    </section>

    <div class="dashboard-grid">
      <section class="card accent-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Review Model</p>
            <h2>Who does what</h2>
          </div>
        </div>
        <div class="list-stack">
          <div class="list-card">
            <strong>Founders</strong>
            <p class="muted">Connect a wallet, submit a Base registration, or generate a Solana proposal package for review.</p>
          </div>
          <div class="list-card">
            <strong>Curator</strong>
            <p class="muted"><code>${escapeHtml(CURATOR_HANDLE)}</code> verifies claims, approves or rejects Base registrations, and publishes Solana approvals.</p>
          </div>
          <div class="list-card">
            <strong>Community</strong>
            <p class="muted">Later phases can delegate approval power, reviewer roles, and broader signal curation to trusted participants.</p>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Curated Projects</p>
            <h2>Published records</h2>
          </div>
          <span class="muted">${projectSummaries.length} total</span>
        </div>
        <div class="list-stack">
          ${projectSummaries.length === 0
            ? '<div class="info-box">No project records are published yet.</div>'
            : projectSummaries.map(({ project, latestAttestation, latestReport }) => `
                <article class="list-card">
                  <div class="list-card-head">
                    <strong>${escapeHtml(project.displayName)}</strong>
                    ${renderVerificationBadge(
                      latestReport?.status || (latestAttestation ? VERIFICATION_STATUSES.AUTHORIZED : VERIFICATION_STATUSES.UNKNOWN),
                      latestReport?.status === VERIFICATION_STATUSES.PENDING_REVIEW
                        ? 'Pending review'
                        : latestReport?.status === VERIFICATION_STATUSES.UNAUTHORIZED
                          ? 'Unauthorized signal'
                          : 'Published',
                    )}
                  </div>
                  <p class="muted">${escapeHtml(project.slug)}</p>
                </article>
              `).join('')}
        </div>
      </section>
    </div>

    <div class="wallet-toolbar">
      <div class="wallet-chip ${_account ? 'is-connected' : 'is-missing'}">
        <strong>EVM</strong>
        <code>${escapeHtml(_account || 'Not connected')}</code>
      </div>
      <div class="wallet-chip ${_solanaAccount ? 'is-connected' : 'is-missing'}">
        <strong>Solana</strong>
        <code>${escapeHtml(_solanaAccount || 'Not connected')}</code>
      </div>
      <div class="wallet-chip ${_solanaWalletProof ? 'is-connected' : 'is-missing'}">
        <strong>Proof</strong>
        <code>${escapeHtml(_solanaWalletProof ? `Signed via ${_solanaWalletProof.walletProvider}` : 'No wallet proof yet')}</code>
      </div>
    </div>

    <div class="dashboard-grid">
      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Base Founder + Curator Tools</p>
            <h2>Live registry state</h2>
          </div>
          <button class="btn btn-secondary" id="dash-connect-btn">${_account ? 'Connected' : 'Connect EVM Wallet'}</button>
        </div>
        <div id="dash-evm-content"></div>
      </section>

      <section class="card accent-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Solana / Bags Review Feed</p>
            <h2>Latest review output</h2>
          </div>
          <button class="btn btn-secondary" id="dash-connect-solana-btn">${_solanaAccount ? 'Connected' : 'Connect Solana Wallet'}</button>
        </div>
        <div class="list-stack">
          ${reports.length === 0
            ? '<div class="info-box">No Solana/Bags reports have been generated yet.</div>'
            : reports.map((report) => `
                <article class="list-card">
                  <div class="list-card-head">
                    <strong>${escapeHtml(report.slugHint || 'Unknown project')}</strong>
                    ${renderVerificationBadge(report.status, `Confidence ${report.confidence}`)}
                  </div>
                  <p class="muted">${escapeHtml(report.assetAddress)}</p>
                  <p class="muted">${escapeHtml(report.venue || 'BAGS')} · ${escapeHtml(formatDate(report.detectedAt))}</p>
                </article>
              `).join('')}
          <div class="card-note">This panel shows Solana/Bags detection output. Authoritative Solana approvals should come from the Solana registry program, with detector output used as evidence rather than final governance state.</div>
        </div>
      </section>
    </div>

    <div class="dashboard-grid">
      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Solana Review Queue</p>
            <h2>Pending native proposals</h2>
          </div>
        </div>
        <div class="list-stack">
          ${!solanaProgramConfigured
            ? '<div class="info-box">Solana registry program is not configured yet.</div>'
            : pendingSolanaProposals.length === 0
              ? '<div class="info-box">No pending Solana proposals.</div>'
              : pendingSolanaProposals.map((proposal) => `
                  <article class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(proposal.displayName || proposal.slug)}</strong>
                      ${renderVerificationBadge(VERIFICATION_STATUSES.PENDING_REVIEW, 'Awaiting Solana review')}
                    </div>
                    ${renderMetaList([
                      { label: 'Slug', value: `<code>${escapeHtml(proposal.slug)}</code>` },
                      { label: 'Submitted By', value: `<code>${escapeHtml(proposal.submittedBy)}</code>` },
                      { label: 'Proposal', value: `<code>${escapeHtml(proposal.address)}</code>` },
                      { label: 'Submitted', value: escapeHtml(formatDate(proposal.submittedAt * 1000)) },
                      { label: 'Metadata', value: safeExternalHref(proposal.metadataURI) ? `<a href="${safeExternalHref(proposal.metadataURI)}" target="_blank" rel="noopener">${escapeHtml(proposal.metadataURI)}</a>` : '—' },
                    ])}
                    ${canReviewSolana ? `
                      <div class="inline-actions">
                        <button class="btn btn-sm btn-primary" data-solana-approve-proposal="${escapeHtml(proposal.address)}">Approve</button>
                        <button class="btn btn-sm btn-danger" data-solana-reject-proposal="${escapeHtml(proposal.address)}">Reject</button>
                      </div>
                      <div id="solana-proposal-result-${escapeHtml(proposal.address)}"></div>
                    ` : '<div class="card-note">Connect the Solana root authority or a delegated Solana approver wallet to review native proposals.</div>'}
                  </article>
                `).join('')}
        </div>
      </section>

      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Solana Asset Records</p>
            <h2>Native wanted and unwanted assets</h2>
          </div>
        </div>
        <div class="form-grid two-col">
          <div class="form-group">
            <label>Project Slug</label>
            <input type="text" id="solana-asset-slug" placeholder="myproject" />
          </div>
          <div class="form-group">
            <label>Asset Type</label>
            <input type="text" id="solana-asset-type" placeholder="MINT or CREATOR_WALLET" />
          </div>
        </div>
        <div class="form-grid two-col">
          <div class="form-group">
            <label>Asset Id</label>
            <input type="text" id="solana-asset-id" placeholder="mint or creator wallet" />
          </div>
          <div class="form-group">
            <label>Metadata URI</label>
            <input type="text" id="solana-asset-uri" placeholder="ipfs://... evidence bundle" />
          </div>
        </div>
        <div class="inline-actions">
          <button class="btn btn-primary" id="solana-authorize-asset-btn">Authorize</button>
          <button class="btn btn-danger" id="solana-unwanted-asset-btn">Mark Unwanted</button>
          <button class="btn btn-secondary" id="solana-revoke-asset-btn">Revoke</button>
        </div>
        <div id="solana-asset-action-result"></div>
        <div class="list-stack">
          ${!solanaProgramConfigured
            ? '<div class="info-box">Solana registry program is not configured yet.</div>'
            : solanaAssets.length === 0
              ? '<div class="info-box">No Solana asset records found.</div>'
              : solanaAssets.slice(0, 12).map((asset) => `
                  <article class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(asset.slug)}</strong>
                      ${renderVerificationBadge(
                        asset.status === 'AUTHORIZED'
                          ? VERIFICATION_STATUSES.AUTHORIZED
                          : asset.status === 'UNWANTED'
                            ? VERIFICATION_STATUSES.UNAUTHORIZED
                            : VERIFICATION_STATUSES.REVOKED,
                        asset.status,
                      )}
                    </div>
                    ${renderMetaList([
                      { label: 'Type', value: escapeHtml(asset.assetType) },
                      { label: 'Asset', value: `<code>${escapeHtml(asset.assetId)}</code>` },
                      { label: 'Actor', value: `<code>${escapeHtml(asset.actor)}</code>` },
                      { label: 'Updated', value: escapeHtml(formatDate(asset.updatedAt * 1000)) },
                    ])}
                  </article>
                `).join('')}
        </div>
      </section>
    </div>

    <div class="dashboard-grid">
      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Solana Registry</p>
            <h2>Native governance state</h2>
          </div>
        </div>
        ${!solanaProgramConfigured
          ? '<div class="info-box">Solana registry program is not configured yet in the frontend.</div>'
          : `
            <div class="kpi-grid compact-grid">
              ${renderKpi('Root Authority', solanaConfig?.rootAuthority ? shortAddr(solanaConfig.rootAuthority) : '—')}
              ${renderKpi('Delegated Approvers', String(solanaApprovers.length))}
              ${renderKpi('Pending Proposals', String(pendingSolanaProposals.length))}
              ${renderKpi('Projects', String(solanaProjects.length))}
              ${renderKpi('Asset Records', String(solanaAssets.length))}
              ${renderKpi('Reviewer Mode', canReviewSolana ? (isSolanaRoot ? 'Root' : 'Approver') : 'No')}
            </div>
            <div class="card-note">Solana proposals, approvals, asset records, and reviewer delegation resolve from the Solana registry program rather than the EVM external-claim queue.</div>
            <div class="list-stack">
              ${solanaApprovers.length === 0
                ? '<div class="info-box">No delegated Solana approvers are active yet.</div>'
                : solanaApprovers.map((approver) => `
                    <article class="list-card">
                      <div class="list-card-head">
                        <strong>${escapeHtml(shortAddr(approver.approver))}</strong>
                        ${renderVerificationBadge(VERIFICATION_STATUSES.AUTHORIZED, 'Active approver')}
                      </div>
                      ${renderMetaList([
                        { label: 'Approver', value: `<code>${escapeHtml(approver.approver)}</code>` },
                        { label: 'Delegated By', value: `<code>${escapeHtml(approver.delegatedBy)}</code>` },
                        { label: 'Updated', value: escapeHtml(formatDate(approver.updatedAt * 1000)) },
                      ])}
                    </article>
                  `).join('')}
            </div>
            ${isSolanaRoot ? `
              <div class="form-grid two-col">
                <div class="form-group">
                  <label>Delegated Approver</label>
                  <input type="text" id="solana-approver-address" placeholder="Solana wallet address" />
                </div>
                <div class="form-group">
                  <label>Rotate Root Authority</label>
                  <input type="text" id="solana-root-rotation-address" placeholder="New Solana root authority" />
                </div>
              </div>
              <div class="inline-actions">
                <button class="btn btn-secondary" id="solana-add-approver-btn">Add Solana Approver</button>
                <button class="btn btn-secondary" id="solana-remove-approver-btn">Remove Solana Approver</button>
                <button class="btn btn-secondary" id="solana-rotate-root-btn">Rotate Root</button>
                <button class="btn btn-danger" id="solana-toggle-pause-btn">${solanaConfig?.paused ? 'Unpause Program' : 'Pause Program'}</button>
              </div>
              <div id="solana-governance-result"></div>
            ` : '<div class="card-note">Only the current Solana root authority can delegate approvers, rotate root authority, or toggle the Solana pause state.</div>'}
          `}
      </section>

      <section class="card accent-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Your Solana Proposals</p>
            <h2>Founder-side native state</h2>
          </div>
        </div>
        <div class="list-stack">
          ${!solanaProgramConfigured
            ? '<div class="info-box">Deploy and configure the Solana registry program to view native proposal state here.</div>'
            : mySolanaProposals.length === 0
              ? '<div class="info-box">No Solana-native proposals found for the connected wallet.</div>'
              : mySolanaProposals.map((proposal) => `
                  <article class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(proposal.displayName || proposal.slug)}</strong>
                      ${renderVerificationBadge(
                        proposal.status === 'APPROVED'
                          ? VERIFICATION_STATUSES.AUTHORIZED
                          : proposal.status === 'REJECTED'
                            ? VERIFICATION_STATUSES.UNAUTHORIZED
                            : VERIFICATION_STATUSES.PENDING_REVIEW,
                        proposal.status,
                      )}
                    </div>
                    ${renderMetaList([
                      { label: 'Slug', value: `<code>${escapeHtml(proposal.slug)}</code>` },
                      { label: 'Proposal', value: `<code>${escapeHtml(proposal.address)}</code>` },
                      { label: 'Submitted', value: escapeHtml(formatDate(proposal.submittedAt * 1000)) },
                      { label: 'Metadata', value: safeExternalHref(proposal.metadataURI) ? `<a href="${safeExternalHref(proposal.metadataURI)}" target="_blank" rel="noopener">${escapeHtml(proposal.metadataURI)}</a>` : '—' },
                    ])}
                  </article>
                `).join('')}
        </div>
      </section>
    </div>

    <div class="dashboard-grid">
      <section class="card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Artifact Integrity</p>
            <h2>Verify a proposal or review bundle locally</h2>
          </div>
        </div>
        <p class="card-copy">Paste any JSON artifact and the onchain anchor hash. The browser canonicalizes it locally and checks whether the content matches the anchored hash.</p>
        <div class="form-group">
          <label>Expected Onchain Hash</label>
          <input type="text" id="artifact-expected-hash" placeholder="0x..." />
        </div>
        <div class="form-group">
          <label>Artifact JSON</label>
          <textarea id="artifact-json-input" placeholder='{"kind":"PROJECT_PROPOSAL", ...}'></textarea>
        </div>
        <div class="inline-actions">
          <button class="btn btn-primary" id="verify-artifact-btn">Verify Artifact</button>
        </div>
        <div id="artifact-verify-result"></div>
      </section>
    </div>
  `;

  $('dash-connect-btn').addEventListener('click', async () => {
    await connectWallet();
    renderWalletStatus();
    await renderEvmDashboard();
  });
  $('dash-connect-solana-btn').addEventListener('click', async () => {
    await connectSolanaWallet();
    renderWalletStatus();
  });
  document.querySelectorAll('[data-solana-approve-proposal]').forEach((button) => {
    button.addEventListener('click', async () => {
      const proposalAddress = button.dataset.solanaApproveProposal;
      const out = $(`solana-proposal-result-${proposalAddress}`);
      const resolutionNotes = prompt(`Approval notes for Solana proposal ${proposalAddress}:`) || 'approved';
      if (!proposalAddress || !out) return;
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const { provider } = detectSolanaProvider();
        const authorityAddress = _solanaAccount || await connectSolanaWallet();
        if (!authorityAddress) return;
        const resolutionArtifact = {
          version: '0.1',
          kind: 'SOLANA_PROJECT_REVIEW',
          proposalAddress,
          approved: true,
          reviewer: authorityAddress,
          reviewedAt: new Date().toISOString(),
          notes: resolutionNotes,
        };
        const resolutionHash = hashExternalClaimPayload(resolutionArtifact);
        let resolutionURI = '';
        try {
          const upload = await uploadJsonArtifact({
            artifact: resolutionArtifact,
            fileName: `${proposalAddress}.approval.json`,
            settings: loadIpfsSettings(),
          });
          resolutionURI = upload.uri;
        } catch {}
        if (!resolutionURI) {
          resolutionURI = prompt('Public review artifact URI for this Solana approval (ipfs://...):', '') || '';
        }
        if (!resolutionURI.trim()) throw new Error('A public review artifact URI is required for Solana approvals.');
        const submission = await reviewSolanaProjectProposal({
          provider,
          authorityAddress,
          proposalAddress,
          approve: true,
          resolutionHash,
          resolutionURI,
        });
        out.innerHTML = `<div class="success-box">Approved on Solana. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });
  document.querySelectorAll('[data-solana-reject-proposal]').forEach((button) => {
    button.addEventListener('click', async () => {
      const proposalAddress = button.dataset.solanaRejectProposal;
      const out = $(`solana-proposal-result-${proposalAddress}`);
      const resolutionNotes = prompt(`Rejection notes for Solana proposal ${proposalAddress}:`);
      if (!proposalAddress || !out || !resolutionNotes) return;
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const { provider } = detectSolanaProvider();
        const authorityAddress = _solanaAccount || await connectSolanaWallet();
        if (!authorityAddress) return;
        const resolutionArtifact = {
          version: '0.1',
          kind: 'SOLANA_PROJECT_REVIEW',
          proposalAddress,
          approved: false,
          reviewer: authorityAddress,
          reviewedAt: new Date().toISOString(),
          notes: resolutionNotes,
        };
        const resolutionHash = hashExternalClaimPayload(resolutionArtifact);
        let resolutionURI = '';
        try {
          const upload = await uploadJsonArtifact({
            artifact: resolutionArtifact,
            fileName: `${proposalAddress}.rejection.json`,
            settings: loadIpfsSettings(),
          });
          resolutionURI = upload.uri;
        } catch {}
        if (!resolutionURI) {
          resolutionURI = prompt('Public review artifact URI for this Solana rejection (ipfs://...):', '') || '';
        }
        if (!resolutionURI.trim()) throw new Error('A public review artifact URI is required for Solana rejections.');
        const submission = await reviewSolanaProjectProposal({
          provider,
          authorityAddress,
          proposalAddress,
          approve: false,
          resolutionHash,
          resolutionURI,
        });
        out.innerHTML = `<div class="success-box">Rejected on Solana. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });
  async function runSolanaAssetAction(action) {
    const out = $('solana-asset-action-result');
    const slug = $('solana-asset-slug').value.trim();
    const assetType = $('solana-asset-type').value.trim();
    const assetId = $('solana-asset-id').value.trim();
    const metadataURI = $('solana-asset-uri').value.trim();
    if (!slug || !assetType || !assetId) {
      out.innerHTML = '<div class="error-box">Slug, asset type, and asset id are required.</div>';
      return;
    }
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const artifact = {
        version: '0.1',
        kind: 'SOLANA_ASSET_ACTION',
        action,
        slug,
        assetType,
        assetId,
        metadataURI,
        actor: authorityAddress,
        createdAt: new Date().toISOString(),
      };
      const metadataHash = hashExternalClaimPayload(artifact);
      const submission = await updateSolanaAssetRecord({
        provider,
        authorityAddress,
        action,
        slug,
        assetType,
        assetId,
        metadataHash,
        metadataURI,
      });
      out.innerHTML = `<div class="success-box">${escapeHtml(action)} submitted on Solana. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  }
  $('solana-authorize-asset-btn')?.addEventListener('click', () => runSolanaAssetAction('authorize'));
  $('solana-unwanted-asset-btn')?.addEventListener('click', () => runSolanaAssetAction('unwanted'));
  $('solana-revoke-asset-btn')?.addEventListener('click', () => runSolanaAssetAction('revoke'));
  $('solana-add-approver-btn')?.addEventListener('click', async () => {
    const out = $('solana-governance-result');
    const approverAddress = $('solana-approver-address').value.trim();
    if (!approverAddress) return toast('Enter a Solana approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await updateSolanaApproverRole({
        provider,
        authorityAddress,
        approverAddress,
        action: 'add',
      });
      out.innerHTML = `<div class="success-box">Solana approver added. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
  $('solana-remove-approver-btn')?.addEventListener('click', async () => {
    const out = $('solana-governance-result');
    const approverAddress = $('solana-approver-address').value.trim();
    if (!approverAddress) return toast('Enter a Solana approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await updateSolanaApproverRole({
        provider,
        authorityAddress,
        approverAddress,
        action: 'remove',
      });
      out.innerHTML = `<div class="success-box">Solana approver removed. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
  $('solana-rotate-root-btn')?.addEventListener('click', async () => {
    const out = $('solana-governance-result');
    const newRootAuthority = $('solana-root-rotation-address').value.trim();
    if (!newRootAuthority) return toast('Enter the new Solana root authority.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await rotateSolanaRootAuthority({
        provider,
        authorityAddress,
        newRootAuthority,
      });
      out.innerHTML = `<div class="success-box">Solana root authority rotated. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
  $('solana-toggle-pause-btn')?.addEventListener('click', async () => {
    const out = $('solana-governance-result');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await setSolanaProgramPause({
        provider,
        authorityAddress,
        paused: !solanaConfig?.paused,
      });
      out.innerHTML = `<div class="success-box">Solana program ${solanaConfig?.paused ? 'unpaused' : 'paused'}. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
  renderWalletStatus();
  $('verify-artifact-btn')?.addEventListener('click', async () => {
    const out = $('artifact-verify-result');
    const expectedHash = $('artifact-expected-hash').value.trim();
    const raw = $('artifact-json-input').value.trim();

    if (!expectedHash) {
      out.innerHTML = '<div class="error-box">Enter the expected onchain hash.</div>';
      return;
    }

    if (!raw) {
      out.innerHTML = '<div class="error-box">Paste an artifact JSON object.</div>';
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const verdict = await verifyArtifactIntegrity(parsed, expectedHash, hashExternalClaimPayload);
      out.innerHTML = `
        <div class="${verdict.matches ? 'success-box' : 'error-box'}">
          ${verdict.matches ? 'Artifact matches the onchain anchor.' : 'Artifact does not match the onchain anchor.'}
        </div>
        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Expected</span>
            <span class="meta-value"><code>${escapeHtml(verdict.expectedHash)}</code></span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Computed</span>
            <span class="meta-value"><code>${escapeHtml(verdict.actualHash)}</code></span>
          </div>
        </div>
        <pre class="code-block">${escapeHtml(prettyPrintArtifact(parsed))}</pre>
      `;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
    }
  });

  await renderEvmDashboard();
}

async function renderEvmDashboard() {
  const container = $('dash-evm-content');
  if (!container) return;

  if (!_account) {
    container.innerHTML = '<div class="info-box">Connect an EVM wallet to use Base registration, shield deployment, and token authorization actions.</div>';
    return;
  }

  setLoading('dash-evm-content', 'Loading Base registry state…');
  try {
    const [registeredLogs, submittedLogs, externalClaims, externalClaimReviews, charityOptions] = await Promise.all([
      getRecentRegistrations(),
      getRecentSubmissions(),
      getRecentExternalClaims(),
      getRecentExternalClaimReviews(),
      listCharityOptions().catch(() => []),
    ]);

    let canApprove = false;
    let isOwner = false;
    let canManageCharities = false;
    try {
      const [owner, approver, charityManager] = await Promise.all([
        getRegistryOwner(),
        isRegistryApprover(_account),
        isCharityCatalogManager(_account).catch(() => false),
      ]);
      isOwner = owner.toLowerCase() === _account.toLowerCase();
      canApprove = isOwner || approver;
      canManageCharities = isOwner || charityManager;
    } catch {}

    const approvedHashes = new Set(registeredLogs.map((entry) => entry.args.nameHash));
    const myActive = registeredLogs.filter((entry) => entry.args.founder?.toLowerCase() === _account.toLowerCase());
    const myPending = submittedLogs.filter((entry) => entry.args.founder?.toLowerCase() === _account.toLowerCase() && !approvedHashes.has(entry.args.nameHash));
    const pendingForReview = canApprove ? submittedLogs.filter((entry) => !approvedHashes.has(entry.args.nameHash)) : [];
    const legacyExternalClaims = externalClaims.filter((entry) => String(entry.args.ecosystem || '').toUpperCase() !== 'SOLANA');
    const legacyExternalClaimReviews = externalClaimReviews.filter((entry) => String(entry.args.ecosystem || '').toUpperCase() !== 'SOLANA');
    const externalReviewMap = new Map(
      legacyExternalClaimReviews.map((entry) => [String(entry.args.claimId), entry]),
    );
    const externalReviewIds = new Set(externalReviewMap.keys());
    const myExternalClaims = legacyExternalClaims.filter((entry) => entry.args.proposer?.toLowerCase() === _account.toLowerCase());
    const pendingExternalClaims = legacyExternalClaims.filter((entry) => !externalReviewIds.has(String(entry.args.claimId)));
    const [myPendingDetails, pendingReviewDetails] = await Promise.all([
      Promise.all(myPending.map(async (entry) => ({
        entry,
        pending: await getPendingInfo(entry.args.name).catch(() => null),
      }))),
      canApprove
        ? Promise.all(pendingForReview.map(async (entry) => ({
            entry,
            pending: await getPendingInfo(entry.args.name).catch(() => null),
          })))
        : Promise.resolve([]),
    ]);

    let html = '';

    html += `
      <article class="card subtle-card">
        <h3>Your Founder Status</h3>
        <div class="kpi-grid compact-grid">
          ${renderKpi('Pending Claims', myPending.length)}
          ${renderKpi('Approved Projects', myActive.length)}
          ${renderKpi('External Claims', myExternalClaims.length)}
          ${renderKpi('Curator Mode', canApprove ? 'Yes' : 'No')}
          ${renderKpi('Owner Controls', isOwner ? 'Yes' : 'No')}
        </div>
        <div class="card-note">Founders submit first. Approval is a separate step controlled by the registry owner or delegated approvers.</div>
      </article>
    `;

    if (canApprove) {
      html += `
        <article class="card subtle-card">
          <h3>Curator Review Queue</h3>
          <div class="list-stack">
            ${pendingReviewDetails.length === 0
              ? '<div class="info-box">No pending registry submissions.</div>'
              : pendingReviewDetails.map(({ entry, pending }) => `
                  <div class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(entry.args.name)}</strong>
                      ${renderVerificationBadge(VERIFICATION_STATUSES.PENDING_REVIEW, 'Awaiting curator decision')}
                    </div>
                    <p class="muted">${escapeHtml(shortAddr(entry.args.founder))} · ${escapeHtml(formatDate(entry.args.submittedAt))}</p>
                    ${renderMetaList([
                      { label: 'Founder', value: `<code>${escapeHtml(pending?.founder || entry.args.founder || '—')}</code>` },
                      { label: 'Submitted', value: escapeHtml(formatDate(pending?.submittedAt || entry.args.submittedAt)) },
                      { label: 'Proof hashes', value: escapeHtml(String(pending?.proofHashes?.length || 0)) },
                    ])}
                    <div class="inline-actions">
                      <button class="btn btn-sm btn-primary" data-approve-name="${escapeHtml(entry.args.name)}">Approve</button>
                      <button class="btn btn-sm btn-danger" data-reject-name="${escapeHtml(entry.args.name)}">Reject</button>
                    </div>
                    <div id="approval-result-${escapeHtml(entry.args.name)}"></div>
                  </div>
                `).join('')}
          </div>
          ${isOwner ? `
            <div class="inline-form">
              <input type="text" id="approver-address-input" placeholder="0x… approver address" />
              <button class="btn btn-secondary" id="add-approver-btn">Add Approver</button>
              <button class="btn btn-secondary" id="remove-approver-btn">Remove Approver</button>
            </div>
            <div id="approver-management-result"></div>
          ` : '<div class="card-note">Approvers can review submissions. Only the registry owner can add or remove approvers.</div>'}
        </article>
      `;
    }

    if (canManageCharities) {
      html += `
        <article class="card subtle-card">
          <h3>Charity Catalog</h3>
          <p class="card-copy">Only approved charity options can be selected for new Shield deployments. Existing Shields keep the charity they were deployed with.</p>
          <div class="form-grid two-col">
            <div class="form-group">
              <label>Charity Name</label>
              <input type="text" id="charity-catalog-name" placeholder="GiveDirectly" />
            </div>
            <div class="form-group">
              <label>Payout Address</label>
              <input type="text" id="charity-catalog-address" placeholder="0x..." />
            </div>
          </div>
          <div class="form-grid two-col">
            <div class="form-group">
              <label>Metadata URI</label>
              <input type="text" id="charity-catalog-uri" placeholder="ipfs://..." />
            </div>
            <div class="form-group">
              <label>Update Charity Id</label>
              <input type="number" min="1" id="charity-catalog-id" placeholder="1" />
            </div>
          </div>
          <div class="inline-actions">
            <button class="btn btn-primary" id="add-charity-option-btn">Add Charity</button>
            <button class="btn btn-secondary" id="update-charity-option-btn">Update Charity</button>
            <label class="wallet-chip">
              <strong>Active</strong>
              <input type="checkbox" id="charity-catalog-active" checked />
            </label>
          </div>
          <div id="charity-catalog-result"></div>
          ${isOwner ? `
            <div class="inline-form">
              <input type="text" id="charity-manager-address-input" placeholder="0x… charity manager address" />
              <button class="btn btn-secondary" id="add-charity-manager-btn">Add Charity Manager</button>
              <button class="btn btn-secondary" id="remove-charity-manager-btn">Remove Charity Manager</button>
            </div>
            <div id="charity-manager-result"></div>
          ` : '<div class="card-note">Charity managers can curate the catalog. Only the registry owner can add or remove charity managers.</div>'}
          <div class="list-stack">
            ${charityOptions.length === 0
              ? '<div class="info-box">No onchain charity options configured yet.</div>'
              : charityOptions.map((option) => `
                  <div class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(option.name)}</strong>
                      ${renderVerificationBadge(
                        option.active ? VERIFICATION_STATUSES.AUTHORIZED : VERIFICATION_STATUSES.REVOKED,
                        option.active ? 'Active' : 'Inactive',
                      )}
                    </div>
                    ${renderMetaList([
                      { label: 'Charity Id', value: `<code>${escapeHtml(String(option.charityId))}</code>` },
                      { label: 'Payout', value: `<code>${escapeHtml(option.payoutAddress)}</code>` },
                      { label: 'Metadata', value: safeExternalHref(option.metadataURI) ? `<a href="${safeExternalHref(option.metadataURI)}" target="_blank" rel="noopener">${escapeHtml(option.metadataURI)}</a>` : '—' },
                    ])}
                  </div>
                `).join('')}
          </div>
        </article>
      `;
    }

    html += `
      <article class="card subtle-card">
        <h3>Legacy External Claim Transparency</h3>
        <div class="list-stack">
          ${myExternalClaims.map((entry) => {
            const review = externalReviewMap.get(String(entry.args.claimId));
            const reviewed = Boolean(review);
            return `
              <div class="list-card">
                <div class="list-card-head">
                  <strong>${escapeHtml(entry.args.name)}</strong>
                  ${renderVerificationBadge(
                    !reviewed
                      ? VERIFICATION_STATUSES.PENDING_REVIEW
                      : review.args.approved
                        ? VERIFICATION_STATUSES.AUTHORIZED
                        : VERIFICATION_STATUSES.UNAUTHORIZED,
                    !reviewed
                      ? 'Anchored for review'
                      : review.args.approved
                        ? 'Approved external claim'
                        : 'Rejected external claim',
                  )}
                </div>
                ${renderMetaList([
                  { label: 'Claim ID', value: `<code>${escapeHtml(String(entry.args.claimId))}</code>` },
                  { label: 'Ecosystem', value: escapeHtml(entry.args.ecosystem || '—') },
                  { label: 'Payload hash', value: `<code>${escapeHtml(entry.args.payloadHash)}</code>` },
                  { label: 'Metadata', value: safeExternalHref(entry.args.metadataURI) ? `<a href="${safeExternalHref(entry.args.metadataURI)}" target="_blank" rel="noopener">${escapeHtml(entry.args.metadataURI)}</a>` : '—' },
                  { label: 'Decision', value: !reviewed ? 'Pending' : (review.args.approved ? 'Approved' : 'Rejected') },
                ])}
              </div>
            `;
          }).join('')}
          ${myExternalClaims.length === 0 ? '<div class="info-box">No legacy external claims anchored from this wallet yet.</div>' : ''}
        </div>
        <div class="card-note">Solana proposals are moving to the native Solana registry program. This section is retained only for non-Solana compatibility flows.</div>
      </article>
    `;

    if (canApprove) {
      html += `
        <article class="card subtle-card">
          <h3>Legacy External Claim Review Queue</h3>
          <div class="list-stack">
            ${pendingExternalClaims.length === 0
              ? '<div class="info-box">No pending cross-chain claims.</div>'
              : pendingExternalClaims.map((entry) => `
                  <div class="list-card">
                    <div class="list-card-head">
                      <strong>${escapeHtml(entry.args.name)}</strong>
                      ${renderVerificationBadge(VERIFICATION_STATUSES.PENDING_REVIEW, 'Onchain external claim')}
                    </div>
                    ${renderMetaList([
                      { label: 'Claim ID', value: `<code>${escapeHtml(String(entry.args.claimId))}</code>` },
                      { label: 'Ecosystem', value: escapeHtml(entry.args.ecosystem || '—') },
                      { label: 'Proposer', value: `<code>${escapeHtml(entry.args.proposer || '—')}</code>` },
                      { label: 'Metadata', value: safeExternalHref(entry.args.metadataURI) ? `<a href="${safeExternalHref(entry.args.metadataURI)}" target="_blank" rel="noopener">${escapeHtml(entry.args.metadataURI)}</a>` : '—' },
                    ])}
                    <div class="inline-actions">
                      <button class="btn btn-sm btn-primary" data-approve-claim-id="${escapeHtml(String(entry.args.claimId))}">Approve Claim</button>
                      <button class="btn btn-sm btn-danger" data-reject-claim-id="${escapeHtml(String(entry.args.claimId))}">Reject Claim</button>
                    </div>
                    <div id="claim-review-result-${escapeHtml(String(entry.args.claimId))}"></div>
                  </div>
                `).join('')}
          </div>
        </article>
      `;
    }

    html += `
      <article class="card subtle-card">
        <h3>Your Base Claims and Projects</h3>
        <div class="list-stack">
          ${myPendingDetails.map(({ entry, pending }) => `
            <div class="list-card">
              <div class="list-card-head">
                <strong>${escapeHtml(entry.args.name)}</strong>
                ${renderVerificationBadge(VERIFICATION_STATUSES.PENDING_REVIEW, 'Pending registry approval')}
              </div>
              <p class="muted">Submitted ${escapeHtml(formatDate(pending?.submittedAt || entry.args.submittedAt))}</p>
              ${renderMetaList([
                { label: 'Claim wallet', value: `<code>${escapeHtml(pending?.founder || entry.args.founder || '—')}</code>` },
                { label: 'Proof hashes', value: escapeHtml(String(pending?.proofHashes?.length || 0)) },
                { label: 'State', value: 'Waiting for curator review' },
              ])}
            </div>
          `).join('')}
          ${await Promise.all(myActive.map(async (entry) => {
            const info = await getProjectInfo(entry.args.name);
            const hasShield = info.shieldContract && info.shieldContract !== '0x0000000000000000000000000000000000000000';
            const shieldBalance = hasShield ? await getShieldBalance(info.shieldContract) : 0n;
            return `
              <div class="list-card">
                <div class="list-card-head">
                  <strong>${escapeHtml(entry.args.name)}</strong>
                  ${renderVerificationBadge(VERIFICATION_STATUSES.AUTHORIZED, 'Approved on Base')}
                </div>
                <p class="muted">Shield: ${hasShield ? `${escapeHtml(shortAddr(info.shieldContract))} (${(Number(shieldBalance) / 1e18).toFixed(4)} ETH)` : 'Not deployed'}</p>
                <div class="inline-form">
                  <input type="text" id="token-input-${escapeHtml(entry.args.name)}" placeholder="0x… token address" />
                  <button class="btn btn-primary btn-sm" data-authorize-name="${escapeHtml(entry.args.name)}">Authorize</button>
                  <button class="btn btn-secondary btn-sm" data-revoke-name="${escapeHtml(entry.args.name)}">Revoke</button>
                </div>
                ${!hasShield ? `
                  <div class="inline-form">
                    ${charityOptions.filter((option) => option.active).length === 0
                      ? '<div class="info-box">No active charity options are configured onchain yet.</div>'
                      : `
                        <select id="charity-input-${escapeHtml(entry.args.name)}">
                          ${charityOptions
                            .filter((option) => option.active)
                            .map((option) => `<option value="${escapeHtml(String(option.charityId))}">${escapeHtml(option.name)}</option>`)
                            .join('')}
                        </select>
                        <button class="btn btn-secondary btn-sm" data-deploy-shield-name="${escapeHtml(entry.args.name)}">Deploy Shield</button>
                      `}
                  </div>
                ` : ''}
                <div id="project-action-result-${escapeHtml(entry.args.name)}"></div>
              </div>
            `;
          })).then((entries) => entries.join(''))}
          ${myPending.length === 0 && myActive.length === 0 ? '<div class="info-box">No Base registry projects found for this wallet.</div>' : ''}
        </div>
      </article>
    `;

    container.innerHTML = html;

    bindDashboardActions(canApprove, isOwner);
  } catch (error) {
    container.innerHTML = `<div class="error-box">${escapeHtml(error.message)}</div>`;
  }
}

function bindDashboardActions(canApprove, isOwner) {
  document.querySelectorAll('[data-authorize-name]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.authorizeName;
      const token = $(`token-input-${name}`).value.trim();
      const out = $(`project-action-result-${name}`);
      if (!token) return toast('Enter a token address', 'error');
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const txHash = await authorizeToken(name, token);
        out.innerHTML = `<div class="success-box">Authorized. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll('[data-revoke-name]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.revokeName;
      const token = $(`token-input-${name}`).value.trim();
      const out = $(`project-action-result-${name}`);
      if (!token) return toast('Enter a token address', 'error');
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const txHash = await revokeToken(name, token);
        out.innerHTML = `<div class="success-box">Revoked. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll('[data-deploy-shield-name]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.deployShieldName;
      const charityId = $(`charity-input-${name}`).value;
      const out = $(`project-action-result-${name}`);
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const txHash = await deployShield(name, charityId);
        out.innerHTML = `<div class="success-box">Shield deployed. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  $('add-charity-option-btn')?.addEventListener('click', async () => {
    const out = $('charity-catalog-result');
    const name = $('charity-catalog-name').value.trim();
    const address = $('charity-catalog-address').value.trim();
    const metadataURI = $('charity-catalog-uri').value.trim();
    if (!name || !address || !metadataURI) return toast('Enter a name, payout address, and metadata URI.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await addCharityOption(name, address, metadataURI);
      out.innerHTML = `<div class="success-box">Charity added. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('update-charity-option-btn')?.addEventListener('click', async () => {
    const out = $('charity-catalog-result');
    const charityId = $('charity-catalog-id').value.trim();
    const name = $('charity-catalog-name').value.trim();
    const address = $('charity-catalog-address').value.trim();
    const metadataURI = $('charity-catalog-uri').value.trim();
    const active = $('charity-catalog-active').checked;
    if (!charityId || !name || !address || !metadataURI) return toast('Enter a charity id, name, payout address, and metadata URI.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await updateCharityOption(charityId, name, address, metadataURI, active);
      out.innerHTML = `<div class="success-box">Charity updated. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('add-charity-manager-btn')?.addEventListener('click', async () => {
    const out = $('charity-manager-result');
    const addr = $('charity-manager-address-input').value.trim();
    if (!addr) return toast('Enter a charity manager address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await addCharityManager(addr);
      out.innerHTML = `<div class="success-box">Charity manager added. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('remove-charity-manager-btn')?.addEventListener('click', async () => {
    const out = $('charity-manager-result');
    const addr = $('charity-manager-address-input').value.trim();
    if (!addr) return toast('Enter a charity manager address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await removeCharityManager(addr);
      out.innerHTML = `<div class="success-box">Charity manager removed. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  if (!canApprove) return;

  document.querySelectorAll('[data-approve-name]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.approveName;
      const out = $(`approval-result-${name}`);
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const txHash = await approveRegistration(name);
        out.innerHTML = `<div class="success-box">Approved. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll('[data-reject-name]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.dataset.rejectName;
      const out = $(`approval-result-${name}`);
      const reason = prompt(`Why are you rejecting "${name}"?`);
      if (!reason) return;
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const txHash = await rejectRegistration(name, reason);
        out.innerHTML = `<div class="success-box">Rejected. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll('[data-approve-claim-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const claimId = button.dataset.approveClaimId;
      const out = $(`claim-review-result-${claimId}`);
      const reviewNotes = prompt(`Approval notes for external claim #${claimId}:`) || 'approved';
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const reviewArtifact = {
          version: '0.1',
          kind: 'EXTERNAL_CLAIM_REVIEW',
          claimId: Number(claimId),
          approved: true,
          reviewNotes,
          reviewer: _account,
          reviewedAt: new Date().toISOString(),
        };
        const settings = loadIpfsSettings();
        let resolutionURI = '';
        try {
          const upload = await uploadJsonArtifact({
            artifact: reviewArtifact,
            fileName: `external-claim-${claimId}.approval.json`,
            settings,
          });
          resolutionURI = upload.uri;
        } catch {}
        const resolutionHash = hashExternalClaimPayload(reviewArtifact);
        const txHash = await reviewExternalClaim(claimId, true, reviewNotes, resolutionHash, resolutionURI);
        out.innerHTML = `
          <div class="success-box">External claim approved. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>
          <div class="card-note">Review artifact hash: <code>${escapeHtml(resolutionHash)}</code>${safeExternalHref(resolutionURI) ? ` · <a href="${safeExternalHref(resolutionURI)}" target="_blank" rel="noopener">Artifact URI</a>` : ''}</div>
        `;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  document.querySelectorAll('[data-reject-claim-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const claimId = button.dataset.rejectClaimId;
      const out = $(`claim-review-result-${claimId}`);
      const reviewNotes = prompt(`Rejection notes for external claim #${claimId}:`);
      if (!reviewNotes) return;
      out.innerHTML = '<div class="spinner"></div>';
      try {
        const reviewArtifact = {
          version: '0.1',
          kind: 'EXTERNAL_CLAIM_REVIEW',
          claimId: Number(claimId),
          approved: false,
          reviewNotes,
          reviewer: _account,
          reviewedAt: new Date().toISOString(),
        };
        const settings = loadIpfsSettings();
        let resolutionURI = '';
        try {
          const upload = await uploadJsonArtifact({
            artifact: reviewArtifact,
            fileName: `external-claim-${claimId}.rejection.json`,
            settings,
          });
          resolutionURI = upload.uri;
        } catch {}
        const resolutionHash = hashExternalClaimPayload(reviewArtifact);
        const txHash = await reviewExternalClaim(claimId, false, reviewNotes, resolutionHash, resolutionURI);
        out.innerHTML = `
          <div class="success-box">External claim rejected. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>
          <div class="card-note">Review artifact hash: <code>${escapeHtml(resolutionHash)}</code>${safeExternalHref(resolutionURI) ? ` · <a href="${safeExternalHref(resolutionURI)}" target="_blank" rel="noopener">Artifact URI</a>` : ''}</div>
        `;
      } catch (error) {
        out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
      }
    });
  });

  if (!isOwner) return;

  $('add-approver-btn')?.addEventListener('click', async () => {
    const addr = $('approver-address-input').value.trim();
    const out = $('approver-management-result');
    if (!addr) return toast('Enter an address', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await addApprover(addr);
      out.innerHTML = `<div class="success-box">Approver added. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('remove-approver-btn')?.addEventListener('click', async () => {
    const addr = $('approver-address-input').value.trim();
    const out = $('approver-management-result');
    if (!addr) return toast('Enter an address', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await removeApprover(addr);
      out.innerHTML = `<div class="success-box">Approver removed. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });
}

async function renderGovernance(container) {
  const solanaProgramConfigured = getSolanaProgramStatus(DEFAULT_SOLANA_CHAIN).configured;
  const [
    owner,
    approverEvents,
    charityManagerEvents,
    ownershipTransfers,
    charityOptions,
    submittedLogs,
    registeredLogs,
    externalClaims,
    externalClaimReviews,
    solanaState,
  ] = await Promise.all([
    getRegistryOwner().catch(() => null),
    getRecentApproverEvents().catch(() => ({ added: [], removed: [] })),
    getRecentCharityManagerEvents().catch(() => ({ added: [], removed: [] })),
    getRecentOwnershipTransfers().catch(() => []),
    listCharityOptions().catch(() => []),
    getRecentSubmissions().catch(() => []),
    getRecentRegistrations().catch(() => []),
    getRecentExternalClaims().catch(() => []),
    getRecentExternalClaimReviews().catch(() => []),
    solanaProgramConfigured ? getSolanaProgramState().catch(() => null) : Promise.resolve(null),
  ]);

  const activeEvmApprovers = deriveActiveAddresses(approverEvents.added, approverEvents.removed, 'approver');
  const activeCharityManagers = deriveActiveAddresses(charityManagerEvents.added, charityManagerEvents.removed, 'manager');
  const activeCharities = charityOptions.filter((entry) => entry.active);
  const currentOwner = owner || '—';
  const isOwner = Boolean(_account && owner && owner.toLowerCase() === _account.toLowerCase());
  const solanaConfig = solanaState?.config || null;
  const solanaApprovers = (solanaState?.approvers || []).filter((entry) => entry.active);
  const isSolanaRoot = Boolean(_solanaAccount && solanaConfig?.rootAuthority === _solanaAccount);
  const pendingBaseRegistrations = Math.max(0, submittedLogs.length - registeredLogs.length);
  const pendingLegacyClaims = Math.max(0, externalClaims.length - externalClaimReviews.length);
  const pendingSolanaProposals = (solanaState?.proposals || []).filter((entry) => entry.status === 'PENDING').length;
  const lastOwnershipTransfer = ownershipTransfers[ownershipTransfers.length - 1];

  container.innerHTML = `
    ${renderDeploymentNotice()}
    ${renderSolanaDeploymentNotice()}
    <section class="page-head governance-head">
      <div>
        <p class="eyebrow">TETHICS Governance</p>
        <h1>Operate the protocol like a public utility, not a black box.</h1>
        <p class="page-sub">This surface tracks who can review, curate, pause, rotate, and delegate across Base and Solana. TETHICS starts curator-led under <code>tethics.eth</code> and expands toward community governance through explicit onchain roles.</p>
      </div>
      <div class="governance-badges">
        <span class="wallet-chip ${isOwner ? 'is-connected' : 'is-missing'}"><strong>EVM Root</strong><code>${escapeHtml(currentOwner === '—' ? 'Unavailable' : shortAddr(currentOwner))}</code></span>
        <span class="wallet-chip ${isSolanaRoot ? 'is-connected' : 'is-missing'}"><strong>SOL Root</strong><code>${escapeHtml(solanaConfig?.rootAuthority ? shortAddr(solanaConfig.rootAuthority) : 'Unavailable')}</code></span>
        <span class="wallet-chip ${solanaConfig?.paused ? 'is-missing' : 'is-connected'}"><strong>Program</strong><code>${escapeHtml(solanaConfig?.paused ? 'Paused' : 'Active')}</code></span>
      </div>
    </section>

    <section class="governance-strip">
      ${renderKpi('EVM Approvers', String(activeEvmApprovers.length), 'Base review and approvals')}
      ${renderKpi('Charity Managers', String(activeCharityManagers.length), 'Scoped routing governance')}
      ${renderKpi('Solana Approvers', String(solanaApprovers.length), 'Native Solana reviewer set')}
      ${renderKpi('Pending Queues', String(pendingBaseRegistrations + pendingLegacyClaims + pendingSolanaProposals), 'Cross-chain review backlog')}
    </section>

    <div class="governance-grid">
      <section class="card governance-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">EVM Control Plane</p>
            <h2>Base registry authority</h2>
          </div>
        </div>
        ${renderMetaList([
          { label: 'Owner', value: currentOwner === '—' ? '—' : `<code>${escapeHtml(currentOwner)}</code>` },
          { label: 'Last Transfer', value: lastOwnershipTransfer?.args?.newOwner ? `<code>${escapeHtml(lastOwnershipTransfer.args.newOwner)}</code>` : 'No transfer recorded' },
          { label: 'Approvers', value: escapeHtml(String(activeEvmApprovers.length)) },
          { label: 'Charity Managers', value: escapeHtml(String(activeCharityManagers.length)) },
        ])}
        <div class="list-stack compact-stack">
          <div class="list-card role-card">
            <strong>Protocol Root</strong>
            <p class="muted">Controls ownership transfer, reviewer delegation, and charity catalog delegation on Base.</p>
            ${isOwner ? `
              <div class="inline-form">
                <input type="text" id="governance-evm-owner" placeholder="0x… new owner or multisig" />
                <button class="btn btn-secondary" id="transfer-ownership-btn">Transfer Ownership</button>
              </div>
              <div class="inline-form">
                <input type="text" id="governance-evm-approver" placeholder="0x… delegated Base approver" />
                <button class="btn btn-secondary" id="governance-evm-add-approver">Add Approver</button>
                <button class="btn btn-secondary" id="governance-evm-remove-approver">Remove Approver</button>
              </div>
              <div class="inline-form">
                <input type="text" id="governance-evm-charity-manager" placeholder="0x… charity manager" />
                <button class="btn btn-secondary" id="governance-evm-add-charity-manager">Add Charity Manager</button>
                <button class="btn btn-secondary" id="governance-evm-remove-charity-manager">Remove Charity Manager</button>
              </div>
              <div id="transfer-ownership-result"></div>
            ` : '<div class="card-note">Connect the current EVM owner to rotate governance or delegate reviewers.</div>'}
          </div>
          <div class="list-card role-card">
            <strong>Review Council</strong>
            <p class="muted">Approvers can approve or reject Base submissions and legacy external claims.</p>
            <div class="address-list">
              ${activeEvmApprovers.length === 0 ? '<span class="muted">No delegated approvers yet.</span>' : activeEvmApprovers.map((address) => `<code>${escapeHtml(address)}</code>`).join('')}
            </div>
          </div>
          <div class="list-card role-card">
            <strong>Charity Council</strong>
            <p class="muted">Scoped managers curate approved charity destinations without taking project-review authority.</p>
            <div class="address-list">
              ${activeCharityManagers.length === 0 ? '<span class="muted">No delegated charity managers yet.</span>' : activeCharityManagers.map((address) => `<code>${escapeHtml(address)}</code>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="card governance-card accent-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Solana Control Plane</p>
            <h2>Native registry governance</h2>
          </div>
        </div>
        ${!solanaProgramConfigured
          ? '<div class="info-box">The Solana registry program is not configured in the frontend yet.</div>'
          : `
            ${renderMetaList([
              { label: 'Root Authority', value: solanaConfig?.rootAuthority ? `<code>${escapeHtml(solanaConfig.rootAuthority)}</code>` : '—' },
              { label: 'Delegated Approvers', value: escapeHtml(String(solanaApprovers.length)) },
              { label: 'Paused', value: solanaConfig?.paused ? 'Yes' : 'No' },
              { label: 'Native Pending', value: escapeHtml(String(pendingSolanaProposals)) },
            ])}
            <div class="list-stack compact-stack">
              <div class="list-card role-card">
                <strong>Root Authority</strong>
                <p class="muted">Can rotate the root key, toggle the Solana pause state, and manage delegated approver PDAs.</p>
                ${isSolanaRoot ? `
                  <div class="inline-form">
                    <input type="text" id="governance-solana-approver" placeholder="Solana wallet for delegated approver" />
                    <button class="btn btn-secondary" id="governance-solana-add-approver">Add Approver</button>
                    <button class="btn btn-secondary" id="governance-solana-remove-approver">Remove Approver</button>
                  </div>
                  <div class="inline-form">
                    <input type="text" id="governance-solana-root" placeholder="New Solana root authority" />
                    <button class="btn btn-secondary" id="governance-solana-rotate-root">Rotate Root</button>
                    <button class="btn btn-danger" id="governance-solana-toggle-pause">${solanaConfig?.paused ? 'Unpause Program' : 'Pause Program'}</button>
                  </div>
                  <div id="governance-solana-result"></div>
                ` : '<div class="card-note">Connect the current Solana root authority wallet to manage native governance.</div>'}
              </div>
              <div class="list-card role-card">
                <strong>Solana Review Council</strong>
                <p class="muted">These wallets can review proposals and manage native asset records without holding root authority.</p>
                <div class="address-list">
                  ${solanaApprovers.length === 0
                    ? '<span class="muted">No delegated Solana approvers yet.</span>'
                    : solanaApprovers.map((entry) => `<code>${escapeHtml(entry.approver)}</code>`).join('')}
                </div>
              </div>
            </div>
          `}
      </section>
    </div>

    <div class="governance-grid">
      <section class="card governance-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Governance Health</p>
            <h2>Queues, coverage, and readiness</h2>
          </div>
        </div>
        <div class="governance-health-grid">
          <div class="health-card">
            <span class="health-label">Base registrations</span>
            <strong>${escapeHtml(String(pendingBaseRegistrations))}</strong>
            <p>Pending founder claims waiting for EVM review.</p>
          </div>
          <div class="health-card">
            <span class="health-label">Legacy cross-chain claims</span>
            <strong>${escapeHtml(String(pendingLegacyClaims))}</strong>
            <p>Legacy compatibility items still awaiting a decision.</p>
          </div>
          <div class="health-card">
            <span class="health-label">Solana native proposals</span>
            <strong>${escapeHtml(String(pendingSolanaProposals))}</strong>
            <p>Native Solana founder proposals not yet reviewed.</p>
          </div>
          <div class="health-card">
            <span class="health-label">Active charities</span>
            <strong>${escapeHtml(String(activeCharities.length))}</strong>
            <p>Approved routing destinations available for new Shields.</p>
          </div>
        </div>
        <div class="card-note">Professional governance means explicit delegate sets, visible backlog, and chain-specific emergency controls. TETHICS now exposes those controls in one operator-facing surface.</div>
      </section>

      <section class="card governance-card">
        <div class="panel-head">
          <div>
            <p class="eyebrow">DAO Path</p>
            <h2>What TETHICS can delegate safely today</h2>
          </div>
        </div>
        <div class="list-stack compact-stack">
          <div class="list-card">
            <strong>Review delegation</strong>
            <p class="muted">Base approvers and Solana approvers can review and publish decisions without becoming full protocol root.</p>
          </div>
          <div class="list-card">
            <strong>Scoped routing delegation</strong>
            <p class="muted">Charity managers can curate routing options without controlling approvals or ownership.</p>
          </div>
          <div class="list-card">
            <strong>Root custody migration</strong>
            <p class="muted">Ownership transfer and Solana root rotation make multisig migration possible when the protocol moves from founder-led control to community-backed stewardship.</p>
          </div>
          <div class="list-card">
            <strong>Emergency posture</strong>
            <p class="muted">Solana mutation paths can be paused. EVM governance should still move to multisig-held owner and proxy-admin custody before mainnet operations.</p>
          </div>
        </div>
      </section>
    </div>
  `;

  $('transfer-ownership-btn')?.addEventListener('click', async () => {
    const out = $('transfer-ownership-result');
    const newOwner = $('governance-evm-owner').value.trim();
    if (!newOwner) return toast('Enter a new EVM owner address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await transferRegistryOwnership(newOwner);
      out.innerHTML = `<div class="success-box">Ownership transfer submitted. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-evm-add-approver')?.addEventListener('click', async () => {
    const out = $('transfer-ownership-result');
    const approver = $('governance-evm-approver').value.trim();
    if (!approver) return toast('Enter a Base approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await addApprover(approver);
      out.innerHTML = `<div class="success-box">Base approver added. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-evm-remove-approver')?.addEventListener('click', async () => {
    const out = $('transfer-ownership-result');
    const approver = $('governance-evm-approver').value.trim();
    if (!approver) return toast('Enter a Base approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await removeApprover(approver);
      out.innerHTML = `<div class="success-box">Base approver removed. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-evm-add-charity-manager')?.addEventListener('click', async () => {
    const out = $('transfer-ownership-result');
    const manager = $('governance-evm-charity-manager').value.trim();
    if (!manager) return toast('Enter a charity manager address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await addCharityManager(manager);
      out.innerHTML = `<div class="success-box">Charity manager added. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-evm-remove-charity-manager')?.addEventListener('click', async () => {
    const out = $('transfer-ownership-result');
    const manager = $('governance-evm-charity-manager').value.trim();
    if (!manager) return toast('Enter a charity manager address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await removeCharityManager(manager);
      out.innerHTML = `<div class="success-box">Charity manager removed. <a href="${txExplorerLink(txHash)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-solana-add-approver')?.addEventListener('click', async () => {
    const out = $('governance-solana-result');
    const approverAddress = $('governance-solana-approver').value.trim();
    if (!approverAddress) return toast('Enter a Solana approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await updateSolanaApproverRole({ provider, authorityAddress, approverAddress, action: 'add' });
      out.innerHTML = `<div class="success-box">Solana approver added. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-solana-remove-approver')?.addEventListener('click', async () => {
    const out = $('governance-solana-result');
    const approverAddress = $('governance-solana-approver').value.trim();
    if (!approverAddress) return toast('Enter a Solana approver address.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await updateSolanaApproverRole({ provider, authorityAddress, approverAddress, action: 'remove' });
      out.innerHTML = `<div class="success-box">Solana approver removed. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-solana-rotate-root')?.addEventListener('click', async () => {
    const out = $('governance-solana-result');
    const newRootAuthority = $('governance-solana-root').value.trim();
    if (!newRootAuthority) return toast('Enter a new Solana root authority.', 'error');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await rotateSolanaRootAuthority({ provider, authorityAddress, newRootAuthority });
      out.innerHTML = `<div class="success-box">Solana root rotation submitted. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  $('governance-solana-toggle-pause')?.addEventListener('click', async () => {
    const out = $('governance-solana-result');
    out.innerHTML = '<div class="spinner"></div>';
    try {
      const { provider } = detectSolanaProvider();
      const authorityAddress = _solanaAccount || await connectSolanaWallet();
      if (!authorityAddress) return;
      const submission = await setSolanaProgramPause({
        provider,
        authorityAddress,
        paused: !solanaConfig?.paused,
      });
      out.innerHTML = `<div class="success-box">Solana program ${solanaConfig?.paused ? 'unpaused' : 'paused'}. <a href="${escapeHtml(submission.explorerUrl)}" target="_blank" rel="noopener">View transaction</a></div>`;
    } catch (error) {
      out.innerHTML = `<div class="error-box">${escapeHtml(error.shortMessage || error.message)}</div>`;
    }
  });

  renderWalletStatus();
}

async function renderLeaderboard(container) {
  const [evmReports, solanaReports] = await Promise.all([
    getRecentReports().catch(() => []),
    listRecentSolanaReports(100),
  ]);

  const scores = {};
  for (const report of evmReports) {
    const reporter = report.args.reporter?.toLowerCase();
    if (reporter) scores[reporter] = (scores[reporter] || 0) + 1;
  }
  for (const report of solanaReports) {
    const reporter = report.detectedBy?.id || 'bags-adapter';
    scores[reporter] = (scores[reporter] || 0) + 1;
  }

  const rows = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(name.startsWith('0x') ? shortAddr(name) : name)}</td>
        <td>${escapeHtml(String(count))}</td>
      </tr>
    `)
    .join('');

  container.innerHTML = `
    <section class="page-head">
      <p class="eyebrow">Reporter Activity</p>
      <h1>Registry and Bags signal output</h1>
      <p class="page-sub">This table combines EVM reporter activity with the current Solana system-generated review feed.</p>
    </section>
    <div class="card">
      ${rows
        ? `<table class="leaderboard-table"><thead><tr><th>#</th><th>Reporter</th><th>Records</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<div class="info-box">No report activity yet.</div>'}
    </div>
  `;
}

async function init() {
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) _account = accounts[0];
    } catch {}

    window.ethereum.on('accountsChanged', async (accounts) => {
      _account = accounts[0] || null;
      renderWalletStatus();
      await router();
    });
  }

  const { provider: solanaProvider, label: solanaLabel } = detectSolanaProvider();
  if (solanaProvider) {
    try {
      if (solanaProvider.publicKey) {
        _solanaAccount = solanaProvider.publicKey.toString();
        _solanaWalletLabel = solanaLabel || 'Solana Wallet';
      } else if (typeof solanaProvider.connect === 'function') {
        const response = await solanaProvider.connect({ onlyIfTrusted: true });
        _solanaAccount = response?.publicKey?.toString?.() || solanaProvider.publicKey?.toString?.() || null;
        _solanaWalletLabel = solanaLabel || 'Solana Wallet';
      }
    } catch {}

    if (typeof solanaProvider.on === 'function') {
      solanaProvider.on('connect', (publicKey) => {
        _solanaAccount = publicKey?.toString?.() || solanaProvider.publicKey?.toString?.() || null;
        _solanaWalletLabel = solanaLabel || 'Solana Wallet';
        if (_solanaWalletProof?.address !== _solanaAccount) _solanaWalletProof = null;
        renderWalletStatus();
      });
      solanaProvider.on('disconnect', async () => {
        _solanaAccount = null;
        _solanaWalletProof = null;
        renderWalletStatus();
        await router();
      });
      solanaProvider.on('accountChanged', async (publicKey) => {
        _solanaAccount = publicKey?.toString?.() || null;
        if (_solanaWalletProof?.address !== _solanaAccount) _solanaWalletProof = null;
        renderWalletStatus();
        await router();
      });
    }
  }

  renderWalletStatus();
  $('connect-btn')?.addEventListener('click', connectWallet);
  $('connect-solana-btn')?.addEventListener('click', connectSolanaWallet);
  window.addEventListener('hashchange', router);
  await router();
}

document.addEventListener('DOMContentLoaded', init);
