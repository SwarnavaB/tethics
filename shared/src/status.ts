import type { AuthorizationStatus } from "./schema.js";

export const AUTHORIZATION_STATUSES = {
  AUTHORIZED: "AUTHORIZED",
  UNAUTHORIZED: "UNAUTHORIZED",
  UNKNOWN: "UNKNOWN",
  PENDING_REVIEW: "PENDING_REVIEW",
  REVOKED: "REVOKED",
} as const satisfies Record<string, AuthorizationStatus>;

export interface StatusPresentation {
  label: string;
  tone: "success" | "danger" | "warning" | "neutral";
}

export const STATUS_PRESENTATION: Record<AuthorizationStatus, StatusPresentation> = {
  AUTHORIZED: { label: "Authorized", tone: "success" },
  UNAUTHORIZED: { label: "Unauthorized", tone: "danger" },
  UNKNOWN: { label: "Unknown", tone: "neutral" },
  PENDING_REVIEW: { label: "Pending Review", tone: "warning" },
  REVOKED: { label: "Revoked", tone: "warning" },
};

export function isTerminalAuthorizationStatus(status: AuthorizationStatus): boolean {
  return status === "AUTHORIZED" || status === "UNAUTHORIZED" || status === "REVOKED";
}
