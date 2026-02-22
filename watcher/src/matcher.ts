// tethics Watcher - Name matching heuristics
// Determines whether a token's name/symbol looks like it's impersonating a registered project.

/**
 * Normalize a string for comparison: lowercase, remove spaces and special chars.
 */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s\-_\.]/g, '');
}

/**
 * Check if two strings are "similar enough" to be a potential impersonation.
 * Uses several heuristics:
 * - Exact match after normalization
 * - One is a prefix/suffix of the other
 * - Levenshtein distance <= 1 (typosquatting)
 * - Common substitutions: 0→o, 1→i/l, 3→e, etc.
 */
export function isSimilar(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  if (levenshtein(na, nb) <= 1) return true;
  if (levenshtein(homoglyph(na), nb) <= 1 || levenshtein(na, homoglyph(nb)) <= 1) return true;

  return false;
}

/**
 * Apply common homoglyph/leet-speak substitutions.
 */
function homoglyph(s: string): string {
  return s
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/vv/g, 'w')
    .replace(/rn/g, 'm');
}

/**
 * Compute Levenshtein distance between two strings.
 * Capped at 2 for performance (we only care about distance <= 1).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 99;

  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Given a token name/symbol, find which registered project names it might be impersonating.
 */
export function findMatchingProjects(
  tokenName: string,
  tokenSymbol: string,
  registeredProjects: string[]
): string[] {
  const matches: string[] = [];
  for (const project of registeredProjects) {
    if (isSimilar(tokenName, project) || isSimilar(tokenSymbol, project)) {
      matches.push(project);
    }
  }
  return matches;
}
