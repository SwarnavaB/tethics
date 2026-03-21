import type { BagsCreatorLookup, BagsLaunch } from "./types.js";

export function normalizeCreatorLookup(raw: unknown): BagsCreatorLookup {
  const response = extractResponseRecord(raw);
  const platformData = asRecord(response["platformData"]);

  return {
    wallet: asOptionalString(response["wallet"]),
    provider: asOptionalString(response["provider"]),
    username: asOptionalString(response["username"]),
    displayName: asOptionalString(platformData["display_name"]),
    avatarUrl: asOptionalString(platformData["avatar_url"]),
    raw: asRecord(raw),
  };
}

export function normalizeBagsLaunch(raw: Record<string, unknown>): BagsLaunch {
  const mint = asOptionalString(raw["mint"]) ?? asOptionalString(raw["tokenMint"]) ?? "";
  if (!mint) throw new Error("Cannot normalize Bags launch without a mint address");

  return {
    id: asOptionalString(raw["id"]) ?? `bags:${mint}`,
    venue: "BAGS",
    chain: "solana",
    detectedAt: asOptionalString(raw["detectedAt"]) ?? new Date().toISOString(),
    mint,
    tokenName: asOptionalString(raw["tokenName"]) ?? asOptionalString(raw["name"]),
    tokenSymbol: asOptionalString(raw["tokenSymbol"]) ?? asOptionalString(raw["symbol"]),
    creatorWallet: asOptionalString(raw["creatorWallet"]) ?? asOptionalString(raw["wallet"]),
    launchWallet: asOptionalString(raw["launchWallet"]),
    provider: asOptionalString(raw["provider"]),
    providerUsername: asOptionalString(raw["providerUsername"]) ?? asOptionalString(raw["username"]),
    url: asOptionalString(raw["url"]),
    txHash: asOptionalString(raw["txHash"]) ?? asOptionalString(raw["signature"]),
    metadata: collectMetadata(raw),
    raw,
  };
}

function collectMetadata(raw: Record<string, unknown>): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") metadata[key] = value;
  }
  return metadata;
}

function extractResponseRecord(raw: unknown): Record<string, unknown> {
  const top = asRecord(raw);
  const response = top["response"];
  if (Array.isArray(response)) return asRecord(response[0]);
  return asRecord(response);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
