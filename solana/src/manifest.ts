import {
  createAuthorizedLaunchWalletTemplate,
  createAuthorizedMintTemplate,
  createProjectApprovalTemplate,
} from "./templates.js";
import type { SolanaAttestationEnvelope } from "./attestations.js";

export interface CurationManifest {
  slug: string;
  displayName: string;
  description?: string;
  website?: string;
  socials?: Record<string, string>;
  founderWallets: string[];
  linkedEvmWallets?: string[];
  proofIds?: string[];
  launchWallets?: Array<{
    address: string;
    label?: string;
    venue?: string;
    note?: string;
  }>;
  venueProfiles?: Array<{
    venue: string;
    handles?: string[];
    creatorWallets?: string[];
    metadata?: Record<string, string>;
  }>;
  authorizedMints?: Array<{
    mint: string;
    venue?: string;
    creatorWallet?: string;
    note?: string;
  }>;
}

export interface GeneratedCurationBundle {
  projectRecord: Record<string, unknown>;
  attestations: SolanaAttestationEnvelope[];
}

export function generateCurationBundle(
  manifest: CurationManifest,
  issuerAuthority: string,
): GeneratedCurationBundle {
  const attestations: SolanaAttestationEnvelope[] = [];

  attestations.push(
    createProjectApprovalTemplate({
      issuerAuthority,
      slug: manifest.slug,
      displayName: manifest.displayName,
      founderWallets: manifest.founderWallets,
      linkedEvmWallets: manifest.linkedEvmWallets ?? [],
      socials: manifest.socials ?? {},
      proofIds: manifest.proofIds ?? [],
    }),
  );

  for (const wallet of manifest.launchWallets ?? []) {
    attestations.push(
      createAuthorizedLaunchWalletTemplate({
        issuerAuthority,
        slug: manifest.slug,
        wallet: wallet.address,
        venue: wallet.venue ?? "BAGS",
        note: wallet.note ?? wallet.label,
      }),
    );
  }

  for (const mint of manifest.authorizedMints ?? []) {
    attestations.push(
      createAuthorizedMintTemplate({
        issuerAuthority,
        slug: manifest.slug,
        mint: mint.mint,
        venue: mint.venue ?? "BAGS",
        creatorWallet: mint.creatorWallet,
        note: mint.note,
      }),
    );
  }

  return {
    projectRecord: createProjectRecord(manifest),
    attestations,
  };
}

function createProjectRecord(manifest: CurationManifest): Record<string, unknown> {
  return {
    id: `project_${manifest.slug}`,
    slug: manifest.slug,
    displayName: manifest.displayName,
    description: manifest.description ?? "",
    website: manifest.website ?? "",
    socials: manifest.socials ?? {},
    status: "APPROVED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    approvedBy: [
      {
        id: "curator_tethics",
        label: "tethics.eth / tethics.sol curator",
      },
    ],
    founderIdentities: manifest.founderWallets.map((address, index) => ({
      id: `founder_identity_${manifest.slug}_${index + 1}`,
      ecosystem: "SOLANA",
      chain: "solana",
      address,
      label: index === 0 ? "primary founder wallet" : "founder wallet",
      isPrimary: index === 0,
      proofIds: manifest.proofIds ?? [],
    })),
    proofs: [],
    chainProfiles: [
      {
        id: `chain_profile_${manifest.slug}_solana`,
        projectId: `project_${manifest.slug}`,
        ecosystem: "SOLANA",
        chain: "solana",
        status: "APPROVED",
        launchWallets: (manifest.launchWallets ?? []).map((wallet, index) => ({
          id: `launch_wallet_${manifest.slug}_${index + 1}`,
          address: wallet.address,
          ecosystem: "SOLANA",
          chain: "solana",
          label: wallet.label ?? "approved launch wallet",
          status: "AUTHORIZED",
        })),
        authorizedAssets: (manifest.authorizedMints ?? []).map((mint, index) => ({
          id: `authorized_mint_${manifest.slug}_${index + 1}`,
          projectId: `project_${manifest.slug}`,
          ecosystem: "SOLANA",
          chain: "solana",
          venue: mint.venue ?? "BAGS",
          status: "AUTHORIZED",
          assetType: "MINT",
          address: mint.mint,
          creatorWallet: mint.creatorWallet ?? "",
          metadata: {
            note: mint.note ?? "",
          },
        })),
        venueProfiles: (manifest.venueProfiles ?? []).map((profile, index) => ({
          id: `venue_profile_${manifest.slug}_${index + 1}`,
          venue: profile.venue,
          ecosystem: "SOLANA",
          chain: "solana",
          status: "AUTHORIZED",
          handles: profile.handles ?? [],
          creatorWallets: profile.creatorWallets ?? [],
          metadata: profile.metadata ?? {},
        })),
      },
    ],
    policy: {
      autoAuthorizeLaunchWalletMints: false,
      requireManualReviewForVenueMismatch: true,
      allowedVenues: Array.from(
        new Set([
          ...(manifest.venueProfiles ?? []).map((profile) => profile.venue),
          ...(manifest.launchWallets ?? []).map((wallet) => wallet.venue ?? "BAGS"),
          ...(manifest.authorizedMints ?? []).map((mint) => mint.venue ?? "BAGS"),
        ]),
      ),
    },
    tags: ["curated"],
  };
}
