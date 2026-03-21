import { createHash } from "node:crypto";
import { canonicalizeJson } from "./canonical.js";
import { isValidSolanaAddress } from "./base58.js";

export type SolanaAttestationType =
  | "PROJECT_APPROVAL"
  | "FOUNDER_IDENTITY_APPROVAL"
  | "AUTHORIZED_LAUNCH_WALLET"
  | "AUTHORIZED_MINT"
  | "UNAUTHORIZED_MINT"
  | "REVOCATION";

export interface SolanaAttestationEnvelope {
  version: 1;
  id: string;
  type: SolanaAttestationType;
  issuedAt: string;
  chain: "solana" | "solana-devnet";
  subject: Record<string, string>;
  payload: Record<string, unknown>;
  issuer: {
    authority: string;
    namespace: "tethics.sol";
  };
  signatures: {
    algorithm: "ed25519";
    signer: string;
    signature: string;
  }[];
}

export interface AttestationVerifier {
  verify(
    payload: Uint8Array,
    signature: string,
    signer: string,
  ): Promise<boolean> | boolean;
}

export function createAttestationId(input: Omit<SolanaAttestationEnvelope, "id" | "signatures">): string {
  const digest = createHash("sha256").update(canonicalizeJson(input)).digest("hex");
  return `att_${digest.slice(0, 24)}`;
}

export function createUnsignedAttestation(
  input: Omit<SolanaAttestationEnvelope, "id" | "signatures">,
): SolanaAttestationEnvelope {
  return {
    ...input,
    id: createAttestationId(input),
    signatures: [],
  };
}

export function getAttestationSigningPayload(
  attestation: Omit<SolanaAttestationEnvelope, "signatures">,
): Uint8Array {
  return new TextEncoder().encode(canonicalizeJson(attestation));
}

export function validateAttestationShape(attestation: SolanaAttestationEnvelope): void {
  if (attestation.version !== 1) throw new Error("Unsupported attestation version");
  if (attestation.issuer.namespace !== "tethics.sol") throw new Error("Invalid attestation namespace");
  if (!isValidSolanaAddress(attestation.issuer.authority)) throw new Error("Invalid issuer authority");

  for (const signature of attestation.signatures) {
    if (signature.algorithm !== "ed25519") throw new Error("Unsupported signature algorithm");
    if (!isValidSolanaAddress(signature.signer)) throw new Error("Invalid attestation signer");
  }
}

export async function verifyAttestationSignatures(
  attestation: SolanaAttestationEnvelope,
  verifier: AttestationVerifier,
): Promise<boolean> {
  validateAttestationShape(attestation);
  if (attestation.signatures.length === 0) return false;

  const { signatures, ...unsignedEnvelope } = attestation;
  const payload = getAttestationSigningPayload(unsignedEnvelope);

  for (const entry of signatures) {
    const ok = await verifier.verify(payload, entry.signature, entry.signer);
    if (!ok) return false;
  }
  return true;
}
