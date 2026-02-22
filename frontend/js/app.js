// tethics - SPA router and page rendering

import {
  getAccount, getWalletClient, getPublicClient,
  isRegistered, getProjectInfo, isAuthorized,
  registerProject, authorizeToken, revokeToken,
  reportUnauthorizedToken, deployShield, predictShieldAddress,
  getRecentReports, getRecentRegistrations, getReporterScore,
  getRecentSubmissions, getRegistryOwner, isRegistryApprover,
  approveRegistration, rejectRegistration, addApprover, removeApprover,
  normalizeName,
} from './registry.js';
import { getShieldInfo, getShieldBalance, getCharityDrainLogs, drainToken, drainETH } from './shield.js';
import { PROOF_TYPES, PROOF_LABELS, CHARITY_OPTIONS, DEFAULT_CHAIN } from './constants.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

function shortAddr(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function explorerLink(addr) {
  const base = DEFAULT_CHAIN.blockExplorer;
  return `${base}/address/${addr}`;
}

function formatTs(ts) {
  if (!ts || ts === 0n) return '—';
  return new Date(Number(ts) * 1000).toLocaleString();
}

function toast(msg, type = 'info') {
  const t = el('div', { className: `toast toast-${type}` }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('visible'), 10);
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 4000);
}

function setLoading(containerId, msg = 'Loading…') {
  const c = $(containerId);
  if (c) c.innerHTML = `<div class="spinner"></div><p class="loading-msg">${msg}</p>`;
}

function renderError(containerId, msg) {
  const c = $(containerId);
  if (c) c.innerHTML = `<div class="error-box">${msg}</div>`;
}

// ── Wallet connection ─────────────────────────────────────────────────────────

let _account = null;

async function connectWallet() {
  try {
    if (!window.ethereum) throw new Error('No wallet found');
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    _account = await getAccount();
    renderWalletStatus();
    return _account;
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

function renderWalletStatus() {
  const btn = $('connect-btn');
  const status = $('wallet-status');
  if (_account) {
    if (btn) btn.textContent = shortAddr(_account);
    if (status) status.textContent = _account;
  } else {
    if (btn) btn.textContent = 'Connect Wallet';
    if (status) status.textContent = '';
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const routes = {
  '': renderHome,
  'register': renderRegister,
  'dashboard': renderDashboard,
  'verify': renderVerify,
  'leaderboard': renderLeaderboard,
};

function getRoute() {
  const hash = window.location.hash.slice(1) || '';
  const parts = hash.split('/').filter(Boolean);
  return { page: parts[0] || '', param: parts[1] || '' };
}

function navigate(path) {
  window.location.hash = path;
}

async function router() {
  const { page, param } = getRoute();
  const main = $('main-content');
  if (!main) return;
  main.innerHTML = '';

  // Update nav active state
  document.querySelectorAll('nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#/' + page ||
      (page === '' && a.getAttribute('href') === '#/'));
  });

  const fn = routes[page];
  if (fn) {
    await fn(main, param);
  } else {
    main.innerHTML = '<div class="error-box">Page not found.</div>';
  }
}

// ── Home page ─────────────────────────────────────────────────────────────────

async function renderHome(container) {
  container.innerHTML = `
    <section class="hero">
      <h1>tethics</h1>
      <p class="hero-sub">Cryptographic proof of token legitimacy - fully onchain, zero infrastructure</p>
      <div class="hero-actions">
        <a href="#/verify" class="btn btn-primary">Verify a Token</a>
        <a href="#/register" class="btn btn-secondary">Register Your Project</a>
      </div>
    </section>
    <section class="how-it-works">
      <h2>How It Works</h2>
      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <h3>Founders Register</h3>
          <p>Prove your identity with 2+ cryptographic proofs (deployer signature, ENS, DNS, GitHub). Zero cost to verify later.</p>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <h3>Deploy a Shield</h3>
          <p>Your Shield contract automatically routes unauthorized token proceeds to charity via DEX swap. Immutable and trustless.</p>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <h3>Anyone Can Verify</h3>
          <p>One onchain call: <code>isAuthorized("project", tokenAddress)</code>. Wallets and DEXs can integrate in minutes.</p>
        </div>
        <div class="step">
          <span class="step-num">4</span>
          <h3>Community Protects</h3>
          <p>Anyone can report unauthorized tokens. Community reporters earn onchain reputation scores.</p>
        </div>
      </div>
    </section>
    <section class="verify-quick">
      <h2>Quick Verification</h2>
      <div class="verify-form" id="home-verify-form">
        <input type="text" id="home-project" placeholder="Project name (e.g. uniswap)" />
        <input type="text" id="home-token" placeholder="Token contract address" />
        <button class="btn btn-primary" id="home-verify-btn">Check</button>
      </div>
      <div id="home-verify-result"></div>
    </section>
  `;

  $('home-verify-btn').addEventListener('click', async () => {
    const name = $('home-project').value.trim();
    const token = $('home-token').value.trim();
    if (!name || !token) { toast('Fill in both fields', 'error'); return; }
    const result = $('home-verify-result');
    result.innerHTML = '<div class="spinner"></div>';
    try {
      const auth = await isAuthorized(name, token);
      result.innerHTML = auth
        ? `<div class="badge badge-verified">AUTHORIZED - The verified founder of "${normalizeName(name)}" has authorized this token.</div>`
        : `<div class="badge badge-unverified">NOT AUTHORIZED - This token was not authorized by the registered founder of "${normalizeName(name)}".</div>`;
    } catch (e) {
      result.innerHTML = `<div class="error-box">${e.message}</div>`;
    }
  });
}

// ── Register page ─────────────────────────────────────────────────────────────

async function renderRegister(container) {
  container.innerHTML = `
    <h1>Register Your Project</h1>
    <p class="page-sub">Prove your identity with at least 2 independent proofs from different categories.</p>

    <div class="card">
      <h2>Step 1: Project Details</h2>
      <div class="form-group">
        <label>Project Name</label>
        <input type="text" id="reg-name" placeholder="myproject (lowercase, 2-64 chars)" />
        <small>Will be normalized to lowercase. Must be unique onchain.</small>
      </div>
    </div>

    <div class="card">
      <h2>Step 2: Add Proofs</h2>
      <p>Add at least 2 proofs from different categories:</p>
      <div id="proof-list"></div>
      <button class="btn btn-secondary" id="add-proof-btn">+ Add Proof</button>
    </div>

    <div class="card">
      <h2>Step 3: Submit for Approval</h2>
      <p>Your registration is submitted onchain and enters a review queue. You must be connected with your founder wallet.</p>
      <p><strong>What happens next:</strong> The tethics team (and any delegated community approvers) will review your off-chain proofs and approve your registration. Once approved, a 48-hour challenge window opens before you can deploy your Shield.</p>
      <button class="btn btn-primary" id="reg-submit-btn">Submit Registration</button>
      <div id="reg-result"></div>
    </div>
  `;

  const proofs = [];

  function renderProofList() {
    const list = $('proof-list');
    list.innerHTML = '';
    proofs.forEach((p, i) => {
      const row = el('div', { className: 'proof-row' },
        el('span', { className: 'proof-type-label' }, PROOF_LABELS[p.proofType]),
        el('span', { className: 'proof-data-preview' }, p.dataPreview || '(data set)'),
        el('button', { className: 'btn btn-sm btn-danger', onClick: () => { proofs.splice(i, 1); renderProofList(); } }, 'Remove')
      );
      list.appendChild(row);
    });
  }

  $('add-proof-btn').addEventListener('click', () => {
    const typeStr = prompt(
      'Choose proof type:\n1 = Deployer Signature\n2 = ENS Name\n3 = DNS TXT Record\n4 = GitHub Gist URL\n5 = Contract Owner\n\nEnter number:'
    );
    const proofType = parseInt(typeStr);
    if (!proofType || proofType < 1 || proofType > 5) { toast('Invalid proof type', 'error'); return; }

    let data, dataPreview;
    if (proofType === PROOF_TYPES.DEPLOYER_SIG) {
      toast('For DEPLOYER_SIG: Sign the commitment in your wallet. Use the Cast command shown in the docs.', 'info');
      const sig = prompt('Paste your ECDSA signature (0x...)');
      if (!sig) return;
      data = sig;
      dataPreview = shortAddr(sig);
    } else if (proofType === PROOF_TYPES.ENS) {
      const ens = prompt('Enter your ENS name (e.g. myproject.eth):');
      if (!ens) return;
      data = ens;
      dataPreview = ens;
    } else if (proofType === PROOF_TYPES.DNS_TXT) {
      const domain = prompt('Enter your domain (e.g. myproject.xyz):');
      if (!domain) return;
      data = domain;
      dataPreview = domain;
    } else if (proofType === PROOF_TYPES.GITHUB) {
      const url = prompt('Enter your GitHub Gist URL:');
      if (!url) return;
      data = url;
      dataPreview = url;
    } else if (proofType === PROOF_TYPES.CONTRACT_OWNER) {
      const addr = prompt('Enter the contract address you own:');
      if (!addr) return;
      data = addr;
      dataPreview = shortAddr(addr);
    }

    // Encode data as bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    const hex = '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    proofs.push({ proofType, data: hex, dataPreview });
    renderProofList();
  });

  $('reg-submit-btn').addEventListener('click', async () => {
    const name = $('reg-name').value.trim();
    const result = $('reg-result');

    if (!name) { toast('Enter a project name', 'error'); return; }
    if (proofs.length < 2) { toast('Add at least 2 proofs', 'error'); return; }

    let account = _account;
    if (!account) {
      account = await connectWallet();
      if (!account) return;
    }

    result.innerHTML = '<div class="spinner"></div><p>Submitting transaction…</p>';
    try {
      const txHash = await registerProject(name, proofs.map(p => ({ proofType: p.proofType, data: p.data })));
      result.innerHTML = `
        <div class="success-box">
          Registration submitted and pending approval.<br>
          <a href="${explorerLink(txHash)}" target="_blank" rel="noopener">View on ${DEFAULT_CHAIN.name} Explorer</a><br>
          <small>Check your <a href="#/dashboard">Dashboard</a> to track approval status.</small>
        </div>
      `;
    } catch (e) {
      result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
    }
  });
}

// ── Dashboard page ────────────────────────────────────────────────────────────

async function renderDashboard(container) {
  container.innerHTML = `
    <h1>Founder Dashboard</h1>
    <div id="dash-content">
      <button class="btn btn-primary" id="dash-connect-btn">Connect Wallet to View Dashboard</button>
    </div>
  `;

  async function loadDashboard(account) {
    setLoading('dash-content', 'Loading your projects…');
    try {
      // Check if this wallet has approver or owner rights
      let canApprove = false;
      try {
        const [ownerAddr, approverStatus] = await Promise.all([
          getRegistryOwner(),
          isRegistryApprover(account),
        ]);
        canApprove = ownerAddr.toLowerCase() === account.toLowerCase() || approverStatus;
      } catch { /* contract not yet deployed */ }

      // Fetch registration events (approved + pending submissions)
      const [registeredLogs, submittedLogs] = await Promise.all([
        getRecentRegistrations(),
        getRecentSubmissions(),
      ]);

      const myActive = registeredLogs.filter(l => l.args.founder?.toLowerCase() === account.toLowerCase());
      const approvedHashes = new Set(registeredLogs.map(l => l.args.nameHash));
      // Pending = submitted by this founder and not yet in the approved set
      const myPending = submittedLogs.filter(l =>
        l.args.founder?.toLowerCase() === account.toLowerCase() &&
        !approvedHashes.has(l.args.nameHash)
      );
      // All pending for approver panel
      const allPending = canApprove
        ? submittedLogs.filter(l => !approvedHashes.has(l.args.nameHash))
        : [];

      const html = [];

      // Approver panel (shown first if applicable)
      if (canApprove) {
        html.push(`
          <div class="approver-panel card">
            <h2>Approver Panel</h2>
            <p>You are authorized to approve or reject pending registrations.</p>
            ${allPending.length === 0
              ? '<p class="muted">No pending registrations at this time.</p>'
              : `<div id="approver-pending-list">${allPending.map(log => {
                const name = log.args.name;
                const founder = log.args.founder;
                const submittedAt = log.args.submittedAt;
                return `
                  <div class="pending-approval-row" id="approval-row-${name}">
                    <div class="pending-approval-info">
                      <strong>${name}</strong>
                      <span class="muted">submitted by <a href="${explorerLink(founder)}" target="_blank">${shortAddr(founder)}</a> at ${formatTs(submittedAt)}</span>
                    </div>
                    <div class="approval-actions">
                      <button class="btn btn-primary btn-sm approve-btn" data-name="${name}">Approve</button>
                      <input type="text" class="reject-reason-input" id="reject-reason-${name}" placeholder="Rejection reason" />
                      <button class="btn btn-danger btn-sm reject-btn" data-name="${name}">Reject</button>
                    </div>
                    <div id="approval-result-${name}"></div>
                  </div>
                `;
              }).join('')}</div>`
            }
            <div class="dash-actions" style="margin-top:1rem">
              <h3>Manage Approvers</h3>
              <input type="text" id="approver-addr-input" placeholder="0x… address" />
              <button class="btn btn-secondary btn-sm" id="add-approver-btn">Add Approver</button>
              <button class="btn btn-danger btn-sm" id="remove-approver-btn">Remove Approver</button>
              <div id="approver-mgmt-result"></div>
            </div>
          </div>
        `);
      }

      // Pending registrations for this founder
      if (myPending.length > 0) {
        html.push('<div class="project-list">');
        for (const log of myPending) {
          const name = log.args.name;
          const submittedAt = log.args.submittedAt;
          html.push(`
            <div class="project-card" data-name="${name}">
              <div class="project-header">
                <h2>${name}</h2>
                <span class="badge badge-pending">Pending Approval</span>
              </div>
              <div class="project-meta">
                <div><strong>Submitted:</strong> ${formatTs(submittedAt)}</div>
              </div>
              <p class="muted">Your registration is awaiting review by the tethics team. You will be able to deploy a Shield and manage tokens once approved.</p>
            </div>
          `);
        }
        html.push('</div>');
      }

      // Active (approved) registrations
      if (myActive.length > 0) {
        html.push('<div class="project-list">');
        for (const log of myActive) {
          const name = log.args.name;
          let info;
          try { info = await getProjectInfo(name); } catch { continue; }

          const hasShield = info.shieldContract && info.shieldContract !== '0x0000000000000000000000000000000000000000';
          const shieldBalance = hasShield ? await getShieldBalance(info.shieldContract) : 0n;
          const challengeOpen = Date.now() / 1000 < Number(info.challengeDeadline);

          html.push(`
            <div class="project-card" data-name="${name}">
              <div class="project-header">
                <h2>${name}</h2>
                ${challengeOpen ? '<span class="badge badge-warning">Challenge Window Open</span>' : '<span class="badge badge-verified">Approved</span>'}
              </div>
              <div class="project-meta">
                <div><strong>Founder:</strong> <a href="${explorerLink(info.founder)}" target="_blank">${shortAddr(info.founder)}</a></div>
                <div><strong>Registered:</strong> ${formatTs(info.registeredAt)}</div>
                <div><strong>Shield:</strong> ${hasShield ? `<a href="${explorerLink(info.shieldContract)}" target="_blank">${shortAddr(info.shieldContract)}</a> (${shieldBalance > 0n ? (Number(shieldBalance) / 1e18).toFixed(4) + ' ETH held' : 'empty'})` : 'Not deployed'}</div>
                <div><strong>Proofs:</strong> ${info.verificationProofs.length} stored</div>
              </div>
              ${!hasShield ? `
                <div class="dash-actions">
                  <h3>Deploy Shield</h3>
                  <select id="charity-sel-${name}">
                    ${CHARITY_OPTIONS.map(c => `<option value="${c.address}">${c.name}</option>`).join('')}
                  </select>
                  <button class="btn btn-primary deploy-shield-btn" data-name="${name}">Deploy Shield</button>
                </div>
              ` : ''}
              <div class="dash-actions">
                <h3>Authorize Token</h3>
                <input type="text" class="authorize-input" id="auth-input-${name}" placeholder="0x… token address" />
                <button class="btn btn-primary authorize-btn" data-name="${name}">Authorize</button>
                <button class="btn btn-secondary revoke-btn" data-name="${name}">Revoke</button>
              </div>
              <div id="dash-result-${name}"></div>
            </div>
          `);
        }
        html.push('</div>');
      }

      if (myActive.length === 0 && myPending.length === 0 && !canApprove) {
        html.push(`
          <div class="info-box">
            No projects registered from <code>${account}</code>.<br>
            <a href="#/register">Register a project</a> to get started.
          </div>
        `);
      }

      $('dash-content').innerHTML = html.join('');

      // Bind approve/reject buttons
      document.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const result = $(`approval-result-${name}`);
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await approveRegistration(name);
            result.innerHTML = `<div class="success-box">Approved! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
            $(`approval-row-${name}`).style.opacity = '0.5';
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      });

      document.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const reason = document.getElementById(`reject-reason-${name}`).value.trim();
          const result = $(`approval-result-${name}`);
          if (!reason) { toast('Enter a rejection reason', 'error'); return; }
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await rejectRegistration(name, reason);
            result.innerHTML = `<div class="success-box">Rejected. <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
            $(`approval-row-${name}`).style.opacity = '0.5';
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      });

      // Bind approver management buttons
      const addBtn = $('add-approver-btn');
      const removeBtn = $('remove-approver-btn');
      if (addBtn) {
        addBtn.addEventListener('click', async () => {
          const addr = $('approver-addr-input').value.trim();
          const result = $('approver-mgmt-result');
          if (!addr) { toast('Enter an address', 'error'); return; }
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await addApprover(addr);
            result.innerHTML = `<div class="success-box">Approver added! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      }
      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          const addr = $('approver-addr-input').value.trim();
          const result = $('approver-mgmt-result');
          if (!addr) { toast('Enter an address', 'error'); return; }
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await removeApprover(addr);
            result.innerHTML = `<div class="success-box">Approver removed. <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      }

      // Bind deploy/authorize/revoke buttons
      document.querySelectorAll('.deploy-shield-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const charity = document.getElementById(`charity-sel-${name}`).value;
          const result = $(`dash-result-${name}`);
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await deployShield(name, charity);
            result.innerHTML = `<div class="success-box">Shield deployed! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      });

      document.querySelectorAll('.authorize-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const token = document.getElementById(`auth-input-${name}`).value.trim();
          const result = $(`dash-result-${name}`);
          if (!token) { toast('Enter token address', 'error'); return; }
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await authorizeToken(name, token);
            result.innerHTML = `<div class="success-box">Token authorized! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      });

      document.querySelectorAll('.revoke-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const name = btn.dataset.name;
          const token = document.getElementById(`auth-input-${name}`).value.trim();
          const result = $(`dash-result-${name}`);
          if (!token) { toast('Enter token address to revoke', 'error'); return; }
          result.innerHTML = '<div class="spinner"></div>';
          try {
            const txHash = await revokeToken(name, token);
            result.innerHTML = `<div class="success-box">Token revoked! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
          } catch (e) {
            result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
          }
        });
      });

    } catch (e) {
      renderError('dash-content', e.message);
    }
  }

  if (_account) {
    await loadDashboard(_account);
  } else {
    $('dash-connect-btn').addEventListener('click', async () => {
      const account = await connectWallet();
      if (account) await loadDashboard(account);
    });
  }
}

// ── Verify page ───────────────────────────────────────────────────────────────

async function renderVerify(container, paramName) {
  container.innerHTML = `
    <h1>Verify a Token</h1>
    <div class="card">
      <div class="form-group">
        <label>Project Name</label>
        <input type="text" id="verify-project" placeholder="e.g. uniswap" value="${paramName || ''}" />
      </div>
      <div class="form-group">
        <label>Token Contract Address (optional)</label>
        <input type="text" id="verify-token" placeholder="0x…" />
      </div>
      <button class="btn btn-primary" id="verify-btn">Verify</button>
    </div>
    <div id="verify-result"></div>
    <div id="report-section" style="display:none">
      <div class="card">
        <h2>Report an Unauthorized Token</h2>
        <input type="text" id="report-token" placeholder="Unauthorized token address" />
        <button class="btn btn-danger" id="report-btn">Report to Registry</button>
        <div id="report-result"></div>
      </div>
    </div>
  `;

  async function doVerify() {
    const name = $('verify-project').value.trim();
    const tokenAddr = $('verify-token').value.trim();
    const result = $('verify-result');
    if (!name) { toast('Enter a project name', 'error'); return; }

    result.innerHTML = '<div class="spinner"></div>';
    try {
      const info = await getProjectInfo(name);
      if (!info.exists) {
        result.innerHTML = `<div class="badge badge-unverified">Project "${normalizeName(name)}" is NOT registered in tethics.</div>`;
        return;
      }

      const hasShield = info.shieldContract && info.shieldContract !== '0x0000000000000000000000000000000000000000';
      const challengeOpen = Date.now() / 1000 < Number(info.challengeDeadline);
      let authHtml = '';

      if (tokenAddr) {
        const auth = await isAuthorized(name, tokenAddr);
        authHtml = auth
          ? `<div class="badge badge-verified">This token IS AUTHORIZED by the verified founder.</div>`
          : `<div class="badge badge-unverified">This token is NOT AUTHORIZED by the founder. Treat with caution.</div>`;
      }

      const drainLogs = hasShield ? await getCharityDrainLogs(info.shieldContract) : [];
      const totalDrained = drainLogs.reduce((s, l) => s + BigInt(l.args.amount || 0), 0n);

      result.innerHTML = `
        <div class="project-card">
          <div class="project-header">
            <h2>${normalizeName(name)}</h2>
            ${challengeOpen
              ? '<span class="badge badge-warning">Challenge Window Open (48h after registration)</span>'
              : '<span class="badge badge-verified">Identity Verified</span>'}
          </div>
          ${authHtml}
          <div class="project-meta">
            <div><strong>Founder:</strong> <a href="${explorerLink(info.founder)}" target="_blank">${info.founder}</a></div>
            <div><strong>Registered:</strong> ${formatTs(info.registeredAt)}</div>
            <div><strong>Verification Proofs:</strong> ${info.verificationProofs.length} stored onchain</div>
            <div><strong>Shield:</strong> ${hasShield
              ? `<a href="${explorerLink(info.shieldContract)}" target="_blank">${info.shieldContract}</a>`
              : '<span class="muted">Not deployed</span>'}</div>
            ${hasShield ? `<div><strong>Total Drained to Charity:</strong> ${(Number(totalDrained) / 1e18).toFixed(6)} ETH across ${drainLogs.length} drains</div>` : ''}
          </div>
        </div>
      `;

      if (tokenAddr) {
        $('report-section').style.display = 'block';
        $('report-token').value = tokenAddr;
      }

    } catch (e) {
      result.innerHTML = `<div class="error-box">${e.message}</div>`;
    }
  }

  $('verify-btn').addEventListener('click', doVerify);
  if (paramName) doVerify();

  $('report-btn').addEventListener('click', async () => {
    const name = $('verify-project').value.trim();
    const token = $('report-token').value.trim();
    const result = $('report-result');
    if (!token) { toast('Enter token address', 'error'); return; }

    let account = _account;
    if (!account) { account = await connectWallet(); if (!account) return; }

    result.innerHTML = '<div class="spinner"></div>';
    try {
      const txHash = await reportUnauthorizedToken(name, token);
      result.innerHTML = `<div class="success-box">Reported! <a href="${explorerLink(txHash)}" target="_blank">View tx</a></div>`;
    } catch (e) {
      result.innerHTML = `<div class="error-box">${e.shortMessage || e.message}</div>`;
    }
  });
}

// ── Leaderboard page ──────────────────────────────────────────────────────────

async function renderLeaderboard(container) {
  container.innerHTML = `
    <h1>Community Reporter Leaderboard</h1>
    <p class="page-sub">Addresses ranked by number of unauthorized tokens reported to the onchain Registry.</p>
    <div id="leaderboard-content"><div class="spinner"></div></div>
  `;

  try {
    const reports = await getRecentReports();
    const scores = {};
    for (const log of reports) {
      const reporter = log.args.reporter?.toLowerCase();
      if (!reporter) continue;
      scores[reporter] = (scores[reporter] || 0) + 1;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 50);

    if (sorted.length === 0) {
      $('leaderboard-content').innerHTML = '<div class="info-box">No reports yet. Be the first to report an unauthorized token!</div>';
      return;
    }

    let rows = sorted.map(([addr, count], i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="${explorerLink(addr)}" target="_blank">${shortAddr(addr)}</a></td>
        <td>${count}</td>
      </tr>
    `).join('');

    $('leaderboard-content').innerHTML = `
      <table class="leaderboard-table">
        <thead><tr><th>#</th><th>Address</th><th>Reports</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="muted" style="margin-top:1rem">Showing top ${sorted.length} reporters from ${reports.length} total reports.</p>
    `;
  } catch (e) {
    renderError('leaderboard-content', e.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // Try to restore wallet from previous session
  if (window.ethereum) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length > 0) {
        _account = accounts[0];
        renderWalletStatus();
      }
    } catch {}

    window.ethereum.on('accountsChanged', (accs) => {
      _account = accs[0] || null;
      renderWalletStatus();
      router();
    });
  }

  const connectBtn = $('connect-btn');
  if (connectBtn) connectBtn.addEventListener('click', connectWallet);

  window.addEventListener('hashchange', router);
  await router();
}

document.addEventListener('DOMContentLoaded', init);
