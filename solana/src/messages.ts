import { canonicalizeJson } from "./canonical.js";

export interface SolanaRegistrationMessage {
  kind: "tethics/register";
  version: 1;
  slug: string;
  displayName: string;
  wallet: string;
  issuedAt: string;
}

export function createRegistrationMessage(
  input: Omit<SolanaRegistrationMessage, "kind" | "version">,
): SolanaRegistrationMessage {
  return {
    kind: "tethics/register",
    version: 1,
    ...input,
  };
}

export function formatSignableMessage(message: SolanaRegistrationMessage): string {
  return canonicalizeJson(message);
}
