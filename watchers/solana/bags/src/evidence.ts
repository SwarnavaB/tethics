import type { BagsMatchResult } from "./types.js";
import type { LaunchEvidence } from "./shared.js";

export function buildEvidenceFromMatch(match: BagsMatchResult): LaunchEvidence[] {
  return match.reasons.map((reason, index) => ({
    id: `${match.slug}:${index}:${reason.code.toLowerCase()}`,
    type: mapReasonCodeToEvidenceType(reason.code),
    summary: reason.message,
    weight: reason.weight,
    source: {
      kind: "VENUE_API",
      label: "Bags API",
      url: "https://docs.bags.fm/api-reference",
      chain: "solana",
    },
  }));
}

function mapReasonCodeToEvidenceType(code: BagsMatchResult["reasons"][number]["code"]): LaunchEvidence["type"] {
  switch (code) {
    case "NAME_MATCH":
      return "NAME_MATCH";
    case "SYMBOL_MATCH":
      return "SYMBOL_MATCH";
    case "CREATOR_WALLET_MATCH":
      return "VENUE_CREATOR_MATCH";
    case "CREATOR_WALLET_MISMATCH":
      return "VENUE_CREATOR_MISMATCH";
    case "VENUE_HANDLE_MATCH":
      return "SOCIAL_MATCH";
    case "VENUE_HANDLE_MISMATCH":
      return "SOCIAL_MISMATCH";
  }
}
