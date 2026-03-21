export interface ProjectLaunchWallet {
  address: string;
}

export interface ProjectChainProfile {
  launchWallets: ProjectLaunchWallet[];
}

export interface ProjectRecord {
  id?: string;
  slug: string;
  displayName?: string;
  chainProfiles: ProjectChainProfile[];
}

export interface EvidenceSource {
  kind: "ONCHAIN" | "VENUE_API" | "PROJECT_SUBMISSION" | "MANUAL_REVIEW";
  label: string;
  url?: string;
  chain?: "solana";
  txHash?: string;
  account?: string;
}

export interface LaunchEvidence {
  id: string;
  type:
    | "NAME_MATCH"
    | "SYMBOL_MATCH"
    | "WALLET_MATCH"
    | "WALLET_MISMATCH"
    | "VENUE_CREATOR_MATCH"
    | "VENUE_CREATOR_MISMATCH"
    | "SOCIAL_MATCH"
    | "SOCIAL_MISMATCH"
    | "DOMAIN_MATCH"
    | "MANUAL_NOTE";
  summary: string;
  weight: number;
  source: EvidenceSource;
  payload?: Record<string, string>;
}

export interface UnauthorizedReport {
  id: string;
  slugHint?: string;
  ecosystem: "SOLANA";
  chain: "solana";
  venue: "BAGS";
  assetAddress: string;
  launchWallet?: string;
  creatorWallet?: string;
  detectedAt: string;
  detectedBy: {
    id: string;
    source: "SYSTEM";
  };
  confidence: number;
  severity: "INFO" | "WARNING" | "HIGH";
  status: "AUTHORIZED" | "PENDING_REVIEW";
  evidence: LaunchEvidence[];
}

export function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_.]+/g, "");
}

export function normalizeSolanaAddress(value: string): string {
  return value.trim();
}
