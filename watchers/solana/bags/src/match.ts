import { normalizeMatchText, normalizeSolanaAddress } from "./shared.js";
import type { BagsLaunch, BagsMatchResult, MatchReason } from "./types.js";
import type { ProjectRecord } from "./shared.js";

export function matchLaunchToProjects(launch: BagsLaunch, projects: ProjectRecord[]): BagsMatchResult[] {
  const results: BagsMatchResult[] = [];

  for (const project of projects) {
    const reasons: MatchReason[] = [];
    const normalizedSlug = normalizeMatchText(project.slug);
    const normalizedName = normalizeMatchText(launch.tokenName ?? "");
    const normalizedSymbol = normalizeMatchText(launch.tokenSymbol ?? "");

    if (normalizedName && normalizedName === normalizedSlug) {
      reasons.push({ code: "NAME_MATCH", weight: 25, message: "Token name matches protected project slug" });
    }
    if (normalizedSymbol && normalizedSymbol === normalizedSlug) {
      reasons.push({ code: "SYMBOL_MATCH", weight: 20, message: "Token symbol matches protected project slug" });
    }

    const approvedWallets = new Set(
      project.chainProfiles.flatMap((profile) => profile.launchWallets).map((wallet) => normalizeSolanaAddress(wallet.address)),
    );

    const creatorWallet = normalizeSolanaAddress(launch.creatorWallet ?? "");
    if (creatorWallet && approvedWallets.has(creatorWallet)) {
      reasons.push({
        code: "CREATOR_WALLET_MATCH",
        weight: 45,
        message: "Bags creator wallet matches an approved launch wallet",
      });
    } else if (creatorWallet && approvedWallets.size > 0 && reasons.length > 0) {
      reasons.push({
        code: "CREATOR_WALLET_MISMATCH",
        weight: -30,
        message: "Bags creator wallet does not match the project's approved launch wallets",
      });
    }

    const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
    if (score === 0) continue;

    results.push({
      slug: project.slug,
      score,
      suggestedStatus: score >= 80 ? "AUTHORIZED" : score >= 60 ? "PENDING_REVIEW" : "UNKNOWN",
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
