#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getAttestationSigningPayload,
  type SolanaAttestationEnvelope,
  verifyAttestationSignatures,
} from "./attestations.js";
import {
  createAuthorizedLaunchWalletTemplate,
  createAuthorizedMintTemplate,
  createProjectApprovalTemplate,
  createRevocationTemplate,
  createUnauthorizedMintTemplate,
} from "./templates.js";
import {
  loadSolanaKeypairFromFile,
  loadSolanaKeypairFromString,
  signMessage,
  verifyMessage,
} from "./signing.js";
import { generateCurationBundle, type CurationManifest } from "./manifest.js";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "create-project-approval":
      return writeJson(
        requiredArg(args, "--output"),
        createProjectApprovalTemplate({
          issuerAuthority: requiredArg(args, "--issuer"),
          slug: requiredArg(args, "--slug"),
          displayName: requiredArg(args, "--display-name"),
          founderWallets: splitCsv(requiredArg(args, "--founder-wallets")),
          linkedEvmWallets: splitCsv(optionalArg(args, "--linked-evm-wallets") ?? ""),
        }),
      );
    case "create-authorized-launch-wallet":
      return writeJson(
        requiredArg(args, "--output"),
        createAuthorizedLaunchWalletTemplate({
          issuerAuthority: requiredArg(args, "--issuer"),
          slug: requiredArg(args, "--slug"),
          wallet: requiredArg(args, "--wallet"),
          venue: optionalArg(args, "--venue") ?? "BAGS",
          note: optionalArg(args, "--note"),
        }),
      );
    case "create-authorized-mint":
      return writeJson(
        requiredArg(args, "--output"),
        createAuthorizedMintTemplate({
          issuerAuthority: requiredArg(args, "--issuer"),
          slug: requiredArg(args, "--slug"),
          mint: requiredArg(args, "--mint"),
          venue: optionalArg(args, "--venue") ?? "BAGS",
          creatorWallet: optionalArg(args, "--creator-wallet"),
          note: optionalArg(args, "--note"),
        }),
      );
    case "create-unauthorized-mint":
      return writeJson(
        requiredArg(args, "--output"),
        createUnauthorizedMintTemplate({
          issuerAuthority: requiredArg(args, "--issuer"),
          slug: requiredArg(args, "--slug"),
          mint: requiredArg(args, "--mint"),
          venue: optionalArg(args, "--venue") ?? "BAGS",
          creatorWallet: optionalArg(args, "--creator-wallet"),
          confidence: optionalArg(args, "--confidence") ? Number(optionalArg(args, "--confidence")) : undefined,
          reportId: optionalArg(args, "--report-id"),
          note: optionalArg(args, "--note"),
        }),
      );
    case "create-revocation":
      return writeJson(
        requiredArg(args, "--output"),
        createRevocationTemplate({
          issuerAuthority: requiredArg(args, "--issuer"),
          slug: requiredArg(args, "--slug"),
          mint: optionalArg(args, "--mint"),
          wallet: optionalArg(args, "--wallet"),
          targetAttestationId: optionalArg(args, "--target-attestation-id"),
          reason: optionalArg(args, "--reason"),
        }),
      );
    case "sign-attestation":
      return signAttestation(args);
    case "verify-attestation":
      return verifyAttestation(args);
    case "generate-curation-bundle":
      return generateBundle(args);
    default:
      printUsage();
  }
}

async function signAttestation(args: string[]) {
  const inputPath = requiredArg(args, "--input");
  const outputPath = requiredArg(args, "--output");
  const attestation = await loadJson<SolanaAttestationEnvelope>(inputPath);
  const keypair = await loadKeypair(args);

  const { signatures, ...unsignedEnvelope } = attestation;
  const payload = getAttestationSigningPayload(unsignedEnvelope);
  const signature = signMessage(payload, keypair.secretKey);

  const signed: SolanaAttestationEnvelope = {
    ...unsignedEnvelope,
    signatures: [
      ...(signatures ?? []).filter((entry) => entry.signer !== keypair.publicKey),
      {
        algorithm: "ed25519",
        signer: keypair.publicKey,
        signature,
      },
    ],
  };

  await writeJson(outputPath, signed);
}

async function verifyAttestation(args: string[]) {
  const inputPath = requiredArg(args, "--input");
  const attestation = await loadJson<SolanaAttestationEnvelope>(inputPath);

  const ok = await verifyAttestationSignatures(attestation, {
    verify: (payload, signature, signer) => verifyMessage(payload, signature, signer),
  });

  console.log(JSON.stringify({ valid: ok, id: attestation.id, signatures: attestation.signatures.length }, null, 2));
}

async function generateBundle(args: string[]) {
  const manifestPath = requiredArg(args, "--manifest");
  const outputDir = requiredArg(args, "--output-dir");
  const issuer = requiredArg(args, "--issuer");
  const sign = args.includes("--sign");
  const manifest = await loadJson<CurationManifest>(manifestPath);
  const bundle = generateCurationBundle(manifest, issuer);

  const keypair = sign ? await loadKeypair(args) : null;

  await writeJson(`${outputDir}/${manifest.slug}.project.json`, bundle.projectRecord);

  const signedAttestations: SolanaAttestationEnvelope[] = [];
  for (const [index, attestation] of bundle.attestations.entries()) {
    const maybeSigned = keypair ? signEnvelope(attestation, keypair.publicKey, keypair.secretKey) : attestation;
    signedAttestations.push(maybeSigned);
    await writeJson(
      `${outputDir}/${manifest.slug}.attestation.${index + 1}.${attestation.type.toLowerCase()}.json`,
      maybeSigned,
    );
  }

  await writeJson(`${outputDir}/${manifest.slug}.bundle.json`, {
    manifest,
    projectRecord: bundle.projectRecord,
    attestations: signedAttestations,
  });
}

async function loadKeypair(args: string[]) {
  const file = optionalArg(args, "--secret-key-file");
  if (file) {
    return loadSolanaKeypairFromFile(resolve(file));
  }

  const value = process.env["TETHICS_SOL_SECRET_KEY"];
  if (!value) {
    throw new Error("Provide --secret-key-file or set TETHICS_SOL_SECRET_KEY");
  }
  return loadSolanaKeypairFromString(value);
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(resolve(path), JSON.stringify(value, null, 2) + "\n", "utf8");
}

function signEnvelope(
  attestation: SolanaAttestationEnvelope,
  signer: string,
  secretKey: Uint8Array,
): SolanaAttestationEnvelope {
  const { signatures, ...unsignedEnvelope } = attestation;
  const payload = getAttestationSigningPayload(unsignedEnvelope);
  const signature = signMessage(payload, secretKey);

  return {
    ...unsignedEnvelope,
    signatures: [
      ...(signatures ?? []).filter((entry) => entry.signer !== signer),
      {
        algorithm: "ed25519",
        signer,
        signature,
      },
    ],
  };
}

function requiredArg(args: string[], flag: string): string {
  const value = optionalArg(args, flag);
  if (!value) throw new Error(`Missing required ${flag}`);
  return value;
}

function optionalArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function printUsage() {
  console.log(`Usage:
  tethics-solana create-project-approval --issuer <wallet> --slug <slug> --display-name <name> --founder-wallets <w1,w2> --output <file>
  tethics-solana create-authorized-launch-wallet --issuer <wallet> --slug <slug> --wallet <wallet> --output <file>
  tethics-solana create-authorized-mint --issuer <wallet> --slug <slug> --mint <mint> --output <file>
  tethics-solana create-unauthorized-mint --issuer <wallet> --slug <slug> --mint <mint> --output <file>
  tethics-solana create-revocation --issuer <wallet> --slug <slug> [--mint <mint>] [--wallet <wallet>] --output <file>
  tethics-solana sign-attestation --input <file> --output <file> [--secret-key-file <file>]
  tethics-solana verify-attestation --input <file>
  tethics-solana generate-curation-bundle --manifest <file> --output-dir <dir> --issuer <wallet> [--sign] [--secret-key-file <file>]`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
