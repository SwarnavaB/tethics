export const TETHICS_SOLANA_PROGRAM_VERSION = 1;

export const SOLANA_PROGRAM_SEEDS = {
  config: "config",
  approver: "approver",
  project: "project",
  proposal: "proposal",
  asset: "asset",
} as const;

export const SOLANA_ASSET_TYPES = {
  MINT: "MINT",
  CREATOR_WALLET: "CREATOR_WALLET",
  LAUNCH_WALLET: "LAUNCH_WALLET",
  SNS_NAME: "SNS_NAME",
} as const;

export type SolanaAssetType = (typeof SOLANA_ASSET_TYPES)[keyof typeof SOLANA_ASSET_TYPES];

export const SOLANA_ASSET_STATUSES = {
  AUTHORIZED: "AUTHORIZED",
  UNWANTED: "UNWANTED",
  REVOKED: "REVOKED",
} as const;

export const SOLANA_ROLE_TYPES = {
  ROOT_ADMIN: "ROOT_ADMIN",
  APPROVER: "APPROVER",
  REPORTER: "REPORTER",
} as const;

export type SolanaRoleType = (typeof SOLANA_ROLE_TYPES)[keyof typeof SOLANA_ROLE_TYPES];

export const SOLANA_ANCHOR_DISCRIMINATORS = {
  submitProjectProposal: Uint8Array.from([132, 35, 159, 179, 4, 133, 87, 236]),
  approveProjectProposal: Uint8Array.from([191, 136, 135, 34, 184, 124, 229, 15]),
  rejectProjectProposal: Uint8Array.from([56, 246, 130, 149, 180, 67, 115, 78]),
  authorizeAsset: Uint8Array.from([252, 231, 86, 162, 188, 88, 240, 220]),
  markUnwantedAsset: Uint8Array.from([241, 58, 19, 104, 200, 178, 68, 171]),
  revokeAsset: Uint8Array.from([67, 193, 200, 94, 21, 246, 196, 141]),
} as const;

export function normalizeSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeAssetId(input: string): string {
  return String(input || "").trim();
}

export function normalizeAssetType(input: string): SolanaAssetType | string {
  return String(input || "").trim().toUpperCase();
}

function encodeU32LE(value: number): Uint8Array {
  const buffer = new Uint8Array(4);
  new DataView(buffer.buffer).setUint32(0, value, true);
  return buffer;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function encodeLengthPrefixedString(value: string): Uint8Array {
  const bytes = encodeUtf8(value);
  const output = new Uint8Array(4 + bytes.length);
  output.set(encodeU32LE(bytes.length), 0);
  output.set(bytes, 4);
  return output;
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = String(hex || "").replace(/^0x/i, "");
  if (normalized.length === 0) return new Uint8Array();
  if (normalized.length % 2 !== 0) throw new Error("Hex string must have an even length.");
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return out;
}

export function encodeInstructionPayload(parts: Array<number | Uint8Array | string>): Uint8Array {
  const buffers = parts.map((part) => {
    if (typeof part === "number") return Uint8Array.of(part);
    if (typeof part === "string") return encodeLengthPrefixedString(part);
    return part;
  });
  const size = buffers.reduce((sum, entry) => sum + entry.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const entry of buffers) {
    output.set(entry, offset);
    offset += entry.length;
  }
  return output;
}

export function proposalSeedFromHash(metadataHash: string): Uint8Array {
  const bytes = hexToBytes(metadataHash);
  if (bytes.length < 8) throw new Error("metadataHash must be at least 8 bytes.");
  return bytes.slice(0, 8);
}

export function encodeSubmitProjectProposalInstruction(args: {
  slug: string;
  displayName: string;
  metadataHash: string;
  metadataURI: string;
}): Uint8Array {
  return encodeInstructionPayload([
    SOLANA_ANCHOR_DISCRIMINATORS.submitProjectProposal,
    normalizeSlug(args.slug),
    args.displayName.trim(),
    hexToBytes(args.metadataHash),
    args.metadataURI.trim(),
  ]);
}

export function encodeReviewProjectProposalInstruction(args: {
  approve: boolean;
  resolutionHash: string;
  resolutionURI: string;
}): Uint8Array {
  return encodeInstructionPayload([
    args.approve ? SOLANA_ANCHOR_DISCRIMINATORS.approveProjectProposal : SOLANA_ANCHOR_DISCRIMINATORS.rejectProjectProposal,
    hexToBytes(args.resolutionHash),
    args.resolutionURI.trim(),
  ]);
}

export function encodeAssetInstruction(args: {
  action: "authorize" | "unwanted" | "revoke";
  slug: string;
  assetType: string;
  assetId: string;
  metadataHash: string;
  metadataURI: string;
}): Uint8Array {
  const discriminator = args.action === "authorize"
    ? SOLANA_ANCHOR_DISCRIMINATORS.authorizeAsset
    : args.action === "unwanted"
      ? SOLANA_ANCHOR_DISCRIMINATORS.markUnwantedAsset
      : SOLANA_ANCHOR_DISCRIMINATORS.revokeAsset;
  return encodeInstructionPayload([
    discriminator,
    normalizeSlug(args.slug),
    normalizeAssetType(args.assetType),
    normalizeAssetId(args.assetId),
    hexToBytes(args.metadataHash),
    args.metadataURI.trim(),
  ]);
}
