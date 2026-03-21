import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from 'https://esm.sh/@solana/web3.js@1.98.4';
import {
  DEFAULT_SOLANA_CHAIN,
  getSolanaDeploymentStatus,
} from './constants.js';

const PROGRAM_SEEDS = {
  config: 'config',
  approver: 'approver',
  project: 'project',
  proposal: 'proposal',
  asset: 'asset',
};

const ANCHOR_DISCRIMINATORS = {
  rotateRootAuthority: Uint8Array.from([35, 58, 115, 103, 59, 77, 214, 46]),
  setPause: Uint8Array.from([63, 32, 154, 2, 56, 103, 79, 45]),
  addApprover: Uint8Array.from([213, 245, 135, 79, 129, 129, 22, 80]),
  removeApprover: Uint8Array.from([214, 72, 133, 48, 50, 58, 227, 224]),
  submitProjectProposal: Uint8Array.from([132, 35, 159, 179, 4, 133, 87, 236]),
  approveProjectProposal: Uint8Array.from([191, 136, 135, 34, 184, 124, 229, 15]),
  rejectProjectProposal: Uint8Array.from([56, 246, 130, 149, 180, 67, 115, 78]),
  authorizeAsset: Uint8Array.from([252, 231, 86, 162, 188, 88, 240, 220]),
  markUnwantedAsset: Uint8Array.from([241, 58, 19, 104, 200, 178, 68, 171]),
  revokeAsset: Uint8Array.from([67, 193, 200, 94, 21, 246, 196, 141]),
};

const ACCOUNT_DISCRIMINATORS = {
  GlobalConfig: Uint8Array.from([149, 8, 156, 202, 160, 252, 176, 217]),
  ApproverRole: Uint8Array.from([226, 107, 145, 174, 127, 189, 111, 88]),
  ProjectProposal: Uint8Array.from([238, 138, 195, 133, 237, 154, 92, 125]),
  ProjectAccount: Uint8Array.from([179, 110, 82, 178, 208, 35, 171, 116]),
  AssetRecord: Uint8Array.from([26, 40, 78, 169, 45, 6, 254, 10]),
};

let _solanaChain = DEFAULT_SOLANA_CHAIN;
let _connection = null;

export function setSolanaChain(chain) {
  _solanaChain = chain;
  _connection = null;
}

export function getSolanaChain() {
  return _solanaChain;
}

export function getSolanaProgramStatus(chain = _solanaChain) {
  return getSolanaDeploymentStatus(chain);
}

export function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function encodeU32LE(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function encodeUtf8(value) {
  return new TextEncoder().encode(value);
}

function encodeLengthPrefixedString(value) {
  const bytes = encodeUtf8(value);
  const out = new Uint8Array(4 + bytes.length);
  out.set(encodeU32LE(bytes.length), 0);
  out.set(bytes, 4);
  return out;
}

function concatBytes(parts) {
  const size = parts.reduce((sum, entry) => sum + entry.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const entry of parts) {
    out.set(entry, offset);
    offset += entry.length;
  }
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hexToBytes(hex) {
  const normalized = String(hex || '').replace(/^0x/i, '');
  if (!normalized) return new Uint8Array();
  if (normalized.length % 2 !== 0) throw new Error('Hex string must have an even length.');
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return out;
}

function decodeU32LE(data, offset) {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function decodeI64LE(data, offset) {
  const value = new DataView(data.buffer, data.byteOffset + offset, 8).getBigInt64(0, true);
  return Number(value);
}

function decodeFixedBytes(data, offset, size) {
  return data.slice(offset, offset + size);
}

function decodePublicKey(data, offset) {
  return new PublicKey(decodeFixedBytes(data, offset, 32)).toBase58();
}

function decodeString(data, offset) {
  const length = decodeU32LE(data, offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: new TextDecoder().decode(data.slice(start, end)),
    offset: end,
  };
}

function bytesToHex(bytes) {
  return `0x${Array.from(bytes).map((entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

function decodeProposalStatus(value) {
  return ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'][value] || 'UNKNOWN';
}

function decodeProjectStatus(value) {
  return ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'][value] || 'UNKNOWN';
}

function decodeAssetStatus(value) {
  return ['AUTHORIZED', 'UNWANTED', 'REVOKED'][value] || 'UNKNOWN';
}

function decodeGlobalConfigAccount(data, pubkey) {
  let offset = 8;
  return {
    address: pubkey.toBase58(),
    kind: 'GlobalConfig',
    version: data[offset],
    rootAuthority: decodePublicKey(data, offset + 1),
    paused: data[offset + 33] === 1,
    createdAt: decodeI64LE(data, offset + 34),
    updatedAt: decodeI64LE(data, offset + 42),
  };
}

function decodeProjectProposalAccount(data, pubkey) {
  let offset = 8;
  const slug = decodeString(data, offset);
  offset = slug.offset;
  const displayName = decodeString(data, offset);
  offset = displayName.offset;
  const submittedBy = decodePublicKey(data, offset);
  offset += 32;
  const metadataHash = bytesToHex(decodeFixedBytes(data, offset, 32));
  offset += 32;
  const metadataURI = decodeString(data, offset);
  offset = metadataURI.offset;
  const status = decodeProposalStatus(data[offset]);
  offset += 1;
  const submittedAt = decodeI64LE(data, offset);
  offset += 8;
  const reviewedBy = decodePublicKey(data, offset);
  offset += 32;
  const reviewedAt = decodeI64LE(data, offset);
  offset += 8;
  const resolutionHash = bytesToHex(decodeFixedBytes(data, offset, 32));
  offset += 32;
  const resolutionURI = decodeString(data, offset);

  return {
    address: pubkey.toBase58(),
    kind: 'ProjectProposal',
    slug: slug.value,
    displayName: displayName.value,
    submittedBy,
    metadataHash,
    metadataURI: metadataURI.value,
    status,
    submittedAt,
    reviewedBy,
    reviewedAt,
    resolutionHash,
    resolutionURI: resolutionURI.value,
  };
}

function decodeApproverRoleAccount(data, pubkey) {
  let offset = 8;
  const approver = decodePublicKey(data, offset);
  offset += 32;
  const active = data[offset] === 1;
  offset += 1;
  const delegatedBy = decodePublicKey(data, offset);
  offset += 32;
  const createdAt = decodeI64LE(data, offset);
  offset += 8;
  const updatedAt = decodeI64LE(data, offset);

  return {
    address: pubkey.toBase58(),
    kind: 'ApproverRole',
    approver,
    active,
    delegatedBy,
    createdAt,
    updatedAt,
  };
}

function decodeProjectAccount(data, pubkey) {
  let offset = 8;
  const slug = decodeString(data, offset);
  offset = slug.offset;
  const displayName = decodeString(data, offset);
  offset = displayName.offset;
  const status = decodeProjectStatus(data[offset]);
  offset += 1;
  const primaryFounderWallet = decodePublicKey(data, offset);
  offset += 32;
  const metadataHash = bytesToHex(decodeFixedBytes(data, offset, 32));
  offset += 32;
  const metadataURI = decodeString(data, offset);
  offset = metadataURI.offset;
  const createdAt = decodeI64LE(data, offset);
  offset += 8;
  const updatedAt = decodeI64LE(data, offset);
  offset += 8;
  const approvedAt = decodeI64LE(data, offset);
  offset += 8;
  const approvedBy = decodePublicKey(data, offset);

  return {
    address: pubkey.toBase58(),
    kind: 'ProjectAccount',
    slug: slug.value,
    displayName: displayName.value,
    status,
    primaryFounderWallet,
    metadataHash,
    metadataURI: metadataURI.value,
    createdAt,
    updatedAt,
    approvedAt,
    approvedBy,
  };
}

function decodeAssetRecordAccount(data, pubkey) {
  let offset = 8;
  const slug = decodeString(data, offset);
  offset = slug.offset;
  const assetType = decodeString(data, offset);
  offset = assetType.offset;
  const assetId = decodeString(data, offset);
  offset = assetId.offset;
  const status = decodeAssetStatus(data[offset]);
  offset += 1;
  const metadataHash = bytesToHex(decodeFixedBytes(data, offset, 32));
  offset += 32;
  const metadataURI = decodeString(data, offset);
  offset = metadataURI.offset;
  const actor = decodePublicKey(data, offset);
  offset += 32;
  const createdAt = decodeI64LE(data, offset);
  offset += 8;
  const updatedAt = decodeI64LE(data, offset);

  return {
    address: pubkey.toBase58(),
    kind: 'AssetRecord',
    slug: slug.value,
    assetType: assetType.value,
    assetId: assetId.value,
    status,
    metadataHash,
    metadataURI: metadataURI.value,
    actor,
    createdAt,
    updatedAt,
  };
}

function decodeProgramAccount({ pubkey, account }) {
  const data = account.data;
  if (data.length < 8) return null;
  const discriminator = data.slice(0, 8);
  if (bytesEqual(discriminator, ACCOUNT_DISCRIMINATORS.GlobalConfig)) return decodeGlobalConfigAccount(data, pubkey);
  if (bytesEqual(discriminator, ACCOUNT_DISCRIMINATORS.ApproverRole)) return decodeApproverRoleAccount(data, pubkey);
  if (bytesEqual(discriminator, ACCOUNT_DISCRIMINATORS.ProjectProposal)) return decodeProjectProposalAccount(data, pubkey);
  if (bytesEqual(discriminator, ACCOUNT_DISCRIMINATORS.ProjectAccount)) return decodeProjectAccount(data, pubkey);
  if (bytesEqual(discriminator, ACCOUNT_DISCRIMINATORS.AssetRecord)) return decodeAssetRecordAccount(data, pubkey);
  return null;
}

function ensureProgramId(chain = _solanaChain) {
  if (!chain?.programId || chain.programId === 'TBD') {
    throw new Error(`Solana registry program not configured on ${chain?.name || 'this cluster'}.`);
  }
  return new PublicKey(chain.programId);
}

export function getSolanaConnection() {
  if (!_connection) {
    _connection = new Connection(_solanaChain.rpcUrl, 'confirmed');
  }
  return _connection;
}

export function getExplorerUrl(path, cluster = _solanaChain) {
  if (!path) return cluster.explorer;
  if (cluster.id === 'solana-mainnet') return `https://explorer.solana.com/${path}`;
  return `https://explorer.solana.com/${path}?cluster=devnet`;
}

export function getConfigPda(chain = _solanaChain) {
  const programId = ensureProgramId(chain);
  return PublicKey.findProgramAddressSync([encodeUtf8(PROGRAM_SEEDS.config)], programId);
}

export function getProjectPda(slug, chain = _solanaChain) {
  const programId = ensureProgramId(chain);
  return PublicKey.findProgramAddressSync(
    [encodeUtf8(PROGRAM_SEEDS.project), encodeUtf8(normalizeSlug(slug))],
    programId,
  );
}

export function getApproverRolePda(approverAddress, chain = _solanaChain) {
  const programId = ensureProgramId(chain);
  return PublicKey.findProgramAddressSync(
    [encodeUtf8(PROGRAM_SEEDS.approver), new PublicKey(approverAddress).toBuffer()],
    programId,
  );
}

export function getProposalPda(proposerAddress, slug, chain = _solanaChain) {
  const programId = ensureProgramId(chain);
  return PublicKey.findProgramAddressSync(
    [encodeUtf8(PROGRAM_SEEDS.proposal), new PublicKey(proposerAddress).toBuffer(), encodeUtf8(normalizeSlug(slug))],
    programId,
  );
}

export function getAssetPda(slug, assetType, assetId, chain = _solanaChain) {
  const programId = ensureProgramId(chain);
  return PublicKey.findProgramAddressSync(
    [
      encodeUtf8(PROGRAM_SEEDS.asset),
      encodeUtf8(normalizeSlug(slug)),
      encodeUtf8(String(assetType || '').trim().toUpperCase()),
      encodeUtf8(String(assetId || '').trim()),
    ],
    programId,
  );
}

export function encodeSubmitProjectProposalInstruction({ slug, displayName, metadataHash, metadataURI }) {
  return concatBytes([
    ANCHOR_DISCRIMINATORS.submitProjectProposal,
    encodeLengthPrefixedString(normalizeSlug(slug)),
    encodeLengthPrefixedString(String(displayName || '').trim()),
    hexToBytes(metadataHash),
    encodeLengthPrefixedString(String(metadataURI || '').trim()),
  ]);
}

export function encodeReviewProjectProposalInstruction({ approve, resolutionHash, resolutionURI }) {
  return concatBytes([
    approve ? ANCHOR_DISCRIMINATORS.approveProjectProposal : ANCHOR_DISCRIMINATORS.rejectProjectProposal,
    hexToBytes(resolutionHash),
    encodeLengthPrefixedString(String(resolutionURI || '').trim()),
  ]);
}

export function encodeRotateRootAuthorityInstruction({ newRootAuthority }) {
  return concatBytes([
    ANCHOR_DISCRIMINATORS.rotateRootAuthority,
    new PublicKey(newRootAuthority).toBytes(),
  ]);
}

export function encodeSetPauseInstruction({ paused }) {
  return concatBytes([
    ANCHOR_DISCRIMINATORS.setPause,
    Uint8Array.from([paused ? 1 : 0]),
  ]);
}

export function encodeApproverManagementInstruction({ action }) {
  return concatBytes([
    action === 'add'
      ? ANCHOR_DISCRIMINATORS.addApprover
      : ANCHOR_DISCRIMINATORS.removeApprover,
  ]);
}

export function encodeAssetInstruction({ action, slug, assetType, assetId, metadataHash, metadataURI }) {
  const discriminator = action === 'authorize'
    ? ANCHOR_DISCRIMINATORS.authorizeAsset
    : action === 'unwanted'
      ? ANCHOR_DISCRIMINATORS.markUnwantedAsset
      : ANCHOR_DISCRIMINATORS.revokeAsset;

  return concatBytes([
    discriminator,
    encodeLengthPrefixedString(normalizeSlug(slug)),
    encodeLengthPrefixedString(String(assetType || '').trim().toUpperCase()),
    encodeLengthPrefixedString(String(assetId || '').trim()),
    hexToBytes(metadataHash),
    encodeLengthPrefixedString(String(metadataURI || '').trim()),
  ]);
}

export async function getSolanaAccountSummary(address, chain = _solanaChain) {
  const connection = getSolanaConnection();
  const publicKey = new PublicKey(address);
  const account = await connection.getAccountInfo(publicKey);
  return {
    address: publicKey.toBase58(),
    exists: Boolean(account),
    lamports: account?.lamports || 0,
    owner: account?.owner?.toBase58?.() || null,
    executable: Boolean(account?.executable),
    dataLength: account?.data?.length || 0,
    chain: chain.id,
  };
}

export async function getSolanaProgramState() {
  const connection = getSolanaConnection();
  const programId = ensureProgramId();
  const accounts = await connection.getProgramAccounts(programId);
  const decoded = accounts
    .map(decodeProgramAccount)
    .filter(Boolean);

  return {
    config: decoded.find((entry) => entry.kind === 'GlobalConfig') || null,
    approvers: decoded
      .filter((entry) => entry.kind === 'ApproverRole')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    proposals: decoded
      .filter((entry) => entry.kind === 'ProjectProposal')
      .sort((a, b) => b.submittedAt - a.submittedAt),
    projects: decoded
      .filter((entry) => entry.kind === 'ProjectAccount')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    assets: decoded
      .filter((entry) => entry.kind === 'AssetRecord')
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export async function submitSolanaProjectProposal({ provider, proposerAddress, slug, displayName, metadataHash, metadataURI }) {
  if (!provider) throw new Error('Connect a Solana wallet first.');
  if (typeof provider.signAndSendTransaction !== 'function') {
    throw new Error('Connected Solana wallet does not support signAndSendTransaction.');
  }

  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) throw new Error('Project slug is required.');
  if (!displayName?.trim()) throw new Error('Display name is required.');
  if (!metadataURI?.trim()) throw new Error('Public metadata URI is required.');
  if (!metadataHash?.trim()) throw new Error('Metadata hash is required.');

  const connection = getSolanaConnection();
  const programId = ensureProgramId();
  const proposer = new PublicKey(proposerAddress);
  const [configPda] = getConfigPda();
  const [proposalPda] = getProposalPda(proposerAddress, normalizedSlug);
  const [projectPda] = getProjectPda(normalizedSlug);

  const instruction = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: proposalPda, isSigner: false, isWritable: true },
      { pubkey: proposer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeSubmitProjectProposalInstruction({
      slug: normalizedSlug,
      displayName,
      metadataHash,
      metadataURI,
    }),
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: proposer,
    recentBlockhash: latest.blockhash,
  }).add(instruction);

  const signature = await provider.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' });
  return {
    signature: typeof signature === 'string' ? signature : signature?.signature,
    proposalAddress: proposalPda.toBase58(),
    projectAddress: projectPda.toBase58(),
    explorerUrl: getExplorerUrl(`tx/${typeof signature === 'string' ? signature : signature?.signature}`),
  };
}

export async function reviewSolanaProjectProposal({
  provider,
  authorityAddress,
  proposalAddress,
  approve,
  resolutionHash,
  resolutionURI,
}) {
  if (!provider) throw new Error('Connect a Solana wallet first.');
  if (typeof provider.signAndSendTransaction !== 'function') {
    throw new Error('Connected Solana wallet does not support signAndSendTransaction.');
  }

  const connection = getSolanaConnection();
  const programId = ensureProgramId();
  const authority = new PublicKey(authorityAddress);
  const proposalPubkey = new PublicKey(proposalAddress);
  const proposalAccount = await connection.getAccountInfo(proposalPubkey);
  if (!proposalAccount) throw new Error('Solana proposal account not found.');
  const decodedProposal = decodeProgramAccount({ pubkey: proposalPubkey, account: proposalAccount });
  if (!decodedProposal || decodedProposal.kind !== 'ProjectProposal') throw new Error('Invalid Solana proposal account.');

  const [configPda] = getConfigPda();
  const [projectPda] = getProjectPda(decodedProposal.slug);
  const [approverRolePda] = getApproverRolePda(authorityAddress);
  const keys = approve
    ? [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: proposalPubkey, isSigner: false, isWritable: true },
        { pubkey: projectPda, isSigner: false, isWritable: true },
        { pubkey: approverRolePda, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ]
    : [
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: proposalPubkey, isSigner: false, isWritable: true },
        { pubkey: approverRolePda, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: true },
      ];

  const instruction = new TransactionInstruction({
    programId,
    keys,
    data: encodeReviewProjectProposalInstruction({ approve, resolutionHash, resolutionURI }),
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: authority,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  const signature = await provider.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' });
  return {
    signature: typeof signature === 'string' ? signature : signature?.signature,
    explorerUrl: getExplorerUrl(`tx/${typeof signature === 'string' ? signature : signature?.signature}`),
    projectAddress: projectPda.toBase58(),
  };
}

export async function updateSolanaAssetRecord({
  provider,
  authorityAddress,
  action,
  slug,
  assetType,
  assetId,
  metadataHash,
  metadataURI,
}) {
  if (!provider) throw new Error('Connect a Solana wallet first.');
  if (typeof provider.signAndSendTransaction !== 'function') {
    throw new Error('Connected Solana wallet does not support signAndSendTransaction.');
  }

  const connection = getSolanaConnection();
  const programId = ensureProgramId();
  const authority = new PublicKey(authorityAddress);
  const [configPda] = getConfigPda();
  const [projectPda] = getProjectPda(slug);
  const [assetPda] = getAssetPda(slug, assetType, assetId);
  const [approverRolePda] = getApproverRolePda(authorityAddress);

  const instruction = new TransactionInstruction({
    programId,
    keys: action === 'revoke'
      ? [
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: projectPda, isSigner: false, isWritable: true },
          { pubkey: assetPda, isSigner: false, isWritable: true },
          { pubkey: approverRolePda, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: true },
        ]
      : [
          { pubkey: configPda, isSigner: false, isWritable: false },
          { pubkey: projectPda, isSigner: false, isWritable: true },
          { pubkey: assetPda, isSigner: false, isWritable: true },
          { pubkey: approverRolePda, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
    data: encodeAssetInstruction({ action, slug, assetType, assetId, metadataHash, metadataURI }),
  });

  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: authority,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  const signature = await provider.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' });
  return {
    signature: typeof signature === 'string' ? signature : signature?.signature,
    explorerUrl: getExplorerUrl(`tx/${typeof signature === 'string' ? signature : signature?.signature}`),
    assetAddress: assetPda.toBase58(),
  };
}

async function sendGovernanceTransaction({ provider, authorityAddress, keys, data }) {
  if (!provider) throw new Error('Connect a Solana wallet first.');
  if (typeof provider.signAndSendTransaction !== 'function') {
    throw new Error('Connected Solana wallet does not support signAndSendTransaction.');
  }

  const connection = getSolanaConnection();
  const programId = ensureProgramId();
  const authority = new PublicKey(authorityAddress);
  const instruction = new TransactionInstruction({ programId, keys, data });
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({
    feePayer: authority,
    recentBlockhash: latest.blockhash,
  }).add(instruction);
  const signature = await provider.signAndSendTransaction(transaction, { preflightCommitment: 'confirmed' });
  return {
    signature: typeof signature === 'string' ? signature : signature?.signature,
    explorerUrl: getExplorerUrl(`tx/${typeof signature === 'string' ? signature : signature?.signature}`),
  };
}

export async function rotateSolanaRootAuthority({ provider, authorityAddress, newRootAuthority }) {
  const authority = new PublicKey(authorityAddress);
  const [configPda] = getConfigPda();
  return sendGovernanceTransaction({
    provider,
    authorityAddress,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: encodeRotateRootAuthorityInstruction({ newRootAuthority }),
  });
}

export async function setSolanaProgramPause({ provider, authorityAddress, paused }) {
  const authority = new PublicKey(authorityAddress);
  const [configPda] = getConfigPda();
  return sendGovernanceTransaction({
    provider,
    authorityAddress,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: encodeSetPauseInstruction({ paused }),
  });
}

export async function updateSolanaApproverRole({ provider, authorityAddress, approverAddress, action }) {
  const authority = new PublicKey(authorityAddress);
  const approver = new PublicKey(approverAddress);
  const [configPda] = getConfigPda();
  const [approverRolePda] = getApproverRolePda(approverAddress);
  return sendGovernanceTransaction({
    provider,
    authorityAddress,
    keys: action === 'add'
      ? [
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: approverRolePda, isSigner: false, isWritable: true },
          { pubkey: approver, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ]
      : [
          { pubkey: configPda, isSigner: false, isWritable: true },
          { pubkey: approverRolePda, isSigner: false, isWritable: true },
          { pubkey: approver, isSigner: false, isWritable: false },
          { pubkey: authority, isSigner: true, isWritable: false },
        ],
    data: encodeApproverManagementInstruction({ action }),
  });
}
