import { createUnsignedAttestation, type SolanaAttestationEnvelope, type SolanaAttestationType } from "./attestations.js";

export interface CreateAttestationInput {
  type: SolanaAttestationType;
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
  issuerAuthority: string;
  subject: Record<string, string>;
  payload: Record<string, unknown>;
}

export function createTemplateAttestation(input: CreateAttestationInput): SolanaAttestationEnvelope {
  return createUnsignedAttestation({
    version: 1,
    type: input.type,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    chain: input.chain ?? "solana",
    subject: input.subject,
    payload: input.payload,
    issuer: {
      authority: input.issuerAuthority,
      namespace: "tethics.sol",
    },
  });
}

export function createProjectApprovalTemplate(input: {
  issuerAuthority: string;
  slug: string;
  displayName: string;
  founderWallets: string[];
  linkedEvmWallets?: string[];
  socials?: Record<string, string>;
  proofIds?: string[];
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
}): SolanaAttestationEnvelope {
  return createTemplateAttestation({
    type: "PROJECT_APPROVAL",
    issuerAuthority: input.issuerAuthority,
    issuedAt: input.issuedAt,
    chain: input.chain,
    subject: { slug: input.slug },
    payload: {
      displayName: input.displayName,
      founderWallets: input.founderWallets,
      linkedEvmWallets: input.linkedEvmWallets ?? [],
      socials: input.socials ?? {},
      proofIds: input.proofIds ?? [],
    },
  });
}

export function createAuthorizedLaunchWalletTemplate(input: {
  issuerAuthority: string;
  slug: string;
  wallet: string;
  venue?: string;
  note?: string;
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
}): SolanaAttestationEnvelope {
  return createTemplateAttestation({
    type: "AUTHORIZED_LAUNCH_WALLET",
    issuerAuthority: input.issuerAuthority,
    issuedAt: input.issuedAt,
    chain: input.chain,
    subject: { slug: input.slug, wallet: input.wallet },
    payload: {
      venue: input.venue ?? "BAGS",
      note: input.note ?? "",
    },
  });
}

export function createAuthorizedMintTemplate(input: {
  issuerAuthority: string;
  slug: string;
  mint: string;
  venue?: string;
  creatorWallet?: string;
  note?: string;
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
}): SolanaAttestationEnvelope {
  return createTemplateAttestation({
    type: "AUTHORIZED_MINT",
    issuerAuthority: input.issuerAuthority,
    issuedAt: input.issuedAt,
    chain: input.chain,
    subject: { slug: input.slug, mint: input.mint },
    payload: {
      venue: input.venue ?? "BAGS",
      creatorWallet: input.creatorWallet ?? "",
      note: input.note ?? "",
    },
  });
}

export function createUnauthorizedMintTemplate(input: {
  issuerAuthority: string;
  slug: string;
  mint: string;
  venue?: string;
  creatorWallet?: string;
  confidence?: number;
  reportId?: string;
  note?: string;
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
}): SolanaAttestationEnvelope {
  return createTemplateAttestation({
    type: "UNAUTHORIZED_MINT",
    issuerAuthority: input.issuerAuthority,
    issuedAt: input.issuedAt,
    chain: input.chain,
    subject: { slug: input.slug, mint: input.mint },
    payload: {
      venue: input.venue ?? "BAGS",
      creatorWallet: input.creatorWallet ?? "",
      confidence: input.confidence ?? null,
      reportId: input.reportId ?? "",
      note: input.note ?? "",
    },
  });
}

export function createRevocationTemplate(input: {
  issuerAuthority: string;
  slug: string;
  mint?: string;
  wallet?: string;
  targetAttestationId?: string;
  reason?: string;
  issuedAt?: string;
  chain?: "solana" | "solana-devnet";
}): SolanaAttestationEnvelope {
  const subject: Record<string, string> = { slug: input.slug };
  if (input.mint) subject.mint = input.mint;
  if (input.wallet) subject.wallet = input.wallet;

  return createTemplateAttestation({
    type: "REVOCATION",
    issuerAuthority: input.issuerAuthority,
    issuedAt: input.issuedAt,
    chain: input.chain,
    subject,
    payload: {
      targetAttestationId: input.targetAttestationId ?? "",
      reason: input.reason ?? "",
    },
  });
}
