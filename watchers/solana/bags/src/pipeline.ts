import { buildEvidenceFromMatch } from "./evidence.js";
import { matchLaunchToProjects } from "./match.js";
import type { ProjectRecord, UnauthorizedReport } from "./shared.js";
import type { BagsLaunch } from "./types.js";

export function evaluateLaunch(launch: BagsLaunch, projects: ProjectRecord[]): UnauthorizedReport[] {
  const matches = matchLaunchToProjects(launch, projects);

  return matches
    .filter(
      (match): match is typeof match & { suggestedStatus: "AUTHORIZED" | "PENDING_REVIEW" } =>
        match.suggestedStatus !== "UNKNOWN",
    )
    .map((match) => ({
      id: `report:${launch.mint}:${match.slug}`,
      slugHint: match.slug,
      ecosystem: "SOLANA",
      chain: "solana",
      venue: "BAGS",
      assetAddress: launch.mint,
      launchWallet: launch.launchWallet,
      creatorWallet: launch.creatorWallet,
      detectedAt: launch.detectedAt,
      detectedBy: { id: "bags-adapter", source: "SYSTEM" },
      confidence: Math.max(0, Math.min(100, match.score)),
      severity: match.score >= 80 ? "HIGH" : "WARNING",
      status: match.suggestedStatus,
      evidence: buildEvidenceFromMatch(match),
    }));
}
