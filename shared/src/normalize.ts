export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-_.]+/g, "");
}

export function normalizeEvmAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSolanaAddress(value: string): string {
  return value.trim();
}
