export type Ecosystem = "EVM" | "SOLANA";

export type ChainId =
  | "ethereum"
  | "base"
  | "base-sepolia"
  | "solana"
  | "solana-devnet";

export type Venue =
  | "BAGS"
  | "PUMP_FUN"
  | "UNISWAP_V2"
  | "UNISWAP_V3"
  | "AERODROME"
  | "DIRECT"
  | "OTHER";

export type ProjectStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";

export type AuthorizationStatus =
  | "AUTHORIZED"
  | "UNAUTHORIZED"
  | "UNKNOWN"
  | "PENDING_REVIEW"
  | "REVOKED";

export type ProofType =
  | "EVM_WALLET_SIG"
  | "SOLANA_WALLET_SIG"
  | "ENS"
  | "SNS"
  | "DNS_TXT"
  | "GITHUB"
  | "CONTRACT_OWNER"
  | "PROGRAM_AUTHORITY"
  | "VENUE_IDENTITY";

export type ProofStatus = "SUBMITTED" | "VERIFIED" | "REJECTED" | "EXPIRED";

export type ReviewDecision =
  | "APPROVE"
  | "REJECT"
  | "MARK_AUTHORIZED"
  | "MARK_UNAUTHORIZED"
  | "REQUEST_MORE_INFO"
  | "REVOKE_AUTHORIZATION";

export type ReportSeverity = "INFO" | "WARNING" | "HIGH";

export interface IdentityRef {
  id: string;
  address?: string;
  label?: string;
}

export interface ReviewerRef {
  id: string;
  address?: string;
  role?: "CURATOR" | "APPROVER" | "REPORTER";
}

export interface ReporterRef {
  id: string;
  address?: string;
  source?: "SYSTEM" | "COMMUNITY" | "CURATOR";
}

export interface ProjectSummary {
  id: string;
  slug: string;
  displayName: string;
  status: ProjectStatus;
}

export interface ProjectPolicy {
  autoAuthorizeLaunchWalletMints?: boolean;
  requireManualReviewForVenueMismatch?: boolean;
  allowedVenues?: Venue[];
}

export interface ProjectSocials {
  x?: string;
  github?: string;
  discord?: string;
  telegram?: string;
  farcaster?: string;
  ens?: string;
  sns?: string;
}

export interface FounderIdentity {
  id: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  address: string;
  label?: string;
  isPrimary: boolean;
  verifiedAt?: string;
  proofIds: string[];
}

export interface EvmWalletSigProof {
  type: "EVM_WALLET_SIG";
  address: string;
  message: string;
  signature: string;
}

export interface SolanaWalletSigProof {
  type: "SOLANA_WALLET_SIG";
  address: string;
  message: string;
  signature: string;
}

export interface EnsProof {
  type: "ENS";
  name: string;
  resolvedAddress?: string;
}

export interface SnsProof {
  type: "SNS";
  name: string;
  resolvedAddress?: string;
}

export interface DnsTxtProof {
  type: "DNS_TXT";
  domain: string;
  expectedValue: string;
}

export interface GithubProof {
  type: "GITHUB";
  handle?: string;
  gistUrl?: string;
  repoUrl?: string;
  signedCommitSha?: string;
}

export interface ContractOwnerProof {
  type: "CONTRACT_OWNER";
  ecosystem: Ecosystem;
  chain: ChainId;
  address: string;
  contractAddress: string;
}

export interface ProgramAuthorityProof {
  type: "PROGRAM_AUTHORITY";
  chain: ChainId;
  address: string;
  programAddress: string;
}

export interface VenueIdentityProof {
  type: "VENUE_IDENTITY";
  venue: Venue;
  handle?: string;
  wallet?: string;
  externalId?: string;
  evidenceUrl?: string;
}

export type ProofPayload =
  | EvmWalletSigProof
  | SolanaWalletSigProof
  | EnsProof
  | SnsProof
  | DnsTxtProof
  | GithubProof
  | ContractOwnerProof
  | ProgramAuthorityProof
  | VenueIdentityProof;

export interface ProofAnchor {
  kind: "HASH" | "URL" | "TX" | "ACCOUNT";
  value: string;
  chain?: ChainId;
}

export interface ProjectProof {
  id: string;
  projectId: string;
  type: ProofType;
  ecosystem?: Ecosystem;
  chain?: ChainId;
  submittedBy: string;
  submittedAt: string;
  status: ProofStatus;
  verifierNotes?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  payload: ProofPayload;
  anchors: ProofAnchor[];
}

export interface LaunchWallet {
  id: string;
  address: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  label?: string;
  status: AuthorizationStatus;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
}

export interface VenueProfile {
  id: string;
  venue: Venue;
  ecosystem: Ecosystem;
  chain: ChainId;
  status: AuthorizationStatus;
  handles?: string[];
  creatorWallets?: string[];
  metadata?: Record<string, string>;
}

export interface AuthorizedAsset {
  id: string;
  projectId: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  venue?: Venue;
  status: AuthorizationStatus;
  assetType: "TOKEN" | "MINT" | "LP" | "DEPLOYER";
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  launchWallet?: string;
  creatorWallet?: string;
  authorizedAt?: string;
  authorizedBy?: string[];
  revokedAt?: string;
  metadata?: Record<string, string>;
}

export interface EvidenceSource {
  kind: "ONCHAIN" | "VENUE_API" | "PROJECT_SUBMISSION" | "MANUAL_REVIEW";
  label: string;
  url?: string;
  chain?: ChainId;
  txHash?: string;
  account?: string;
}

export interface LaunchEvidence {
  id: string;
  type:
    | "NAME_MATCH"
    | "SYMBOL_MATCH"
    | "WALLET_MATCH"
    | "WALLET_MISMATCH"
    | "VENUE_CREATOR_MATCH"
    | "VENUE_CREATOR_MISMATCH"
    | "SOCIAL_MATCH"
    | "SOCIAL_MISMATCH"
    | "DOMAIN_MATCH"
    | "MANUAL_NOTE";
  summary: string;
  weight: number;
  source: EvidenceSource;
  payload?: Record<string, string>;
}

export interface UnauthorizedReport {
  id: string;
  projectId?: string;
  slugHint?: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  venue?: Venue;
  assetAddress: string;
  launchWallet?: string;
  creatorWallet?: string;
  detectedAt: string;
  detectedBy: ReporterRef;
  confidence: number;
  severity: ReportSeverity;
  status: AuthorizationStatus;
  evidence: LaunchEvidence[];
  reviewerNotes?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface ReviewAction {
  id: string;
  targetType: "PROJECT" | "PROOF" | "ASSET" | "REPORT";
  targetId: string;
  decision: ReviewDecision;
  actor: ReviewerRef;
  reason?: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface ChainProfile {
  id: string;
  projectId: string;
  ecosystem: Ecosystem;
  chain: ChainId;
  status: ProjectStatus;
  launchWallets: LaunchWallet[];
  authorizedAssets: AuthorizedAsset[];
  venueProfiles: VenueProfile[];
}

export interface Project {
  id: string;
  slug: string;
  displayName: string;
  description?: string;
  website?: string;
  socials: ProjectSocials;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: IdentityRef[];
  founderIdentities: FounderIdentity[];
  proofs: ProjectProof[];
  chainProfiles: ChainProfile[];
  policy: ProjectPolicy;
  tags?: string[];
}

export interface VerifyRequest {
  slug: string;
  chain: ChainId;
  assetAddress: string;
}

export interface VerifyResponse {
  slug: string;
  chain: ChainId;
  assetAddress: string;
  status: AuthorizationStatus;
  project?: ProjectSummary;
  authorizedAsset?: AuthorizedAsset;
  activeReport?: UnauthorizedReport;
}

export interface ReverseLookupResponse {
  chain: ChainId;
  assetAddress: string;
  matchedProjects: ProjectSummary[];
  authorizedFor?: string;
  activeReports: UnauthorizedReport[];
}
