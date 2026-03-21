export interface BagsLaunch {
  id: string;
  venue: "BAGS";
  chain: "solana";
  detectedAt: string;
  mint: string;
  tokenName?: string;
  tokenSymbol?: string;
  creatorWallet?: string;
  launchWallet?: string;
  provider?: string;
  providerUsername?: string;
  url?: string;
  txHash?: string;
  metadata: Record<string, string>;
  raw: Record<string, unknown>;
}

export interface BagsCreatorLookup {
  wallet?: string;
  provider?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  raw: Record<string, unknown>;
}

export interface MatchReason {
  code:
    | "NAME_MATCH"
    | "SYMBOL_MATCH"
    | "CREATOR_WALLET_MATCH"
    | "CREATOR_WALLET_MISMATCH"
    | "VENUE_HANDLE_MATCH"
    | "VENUE_HANDLE_MISMATCH";
  weight: number;
  message: string;
}

export type SuggestedStatus = "AUTHORIZED" | "PENDING_REVIEW" | "UNKNOWN";

export interface BagsMatchResult {
  slug: string;
  score: number;
  suggestedStatus: SuggestedStatus;
  reasons: MatchReason[];
}
