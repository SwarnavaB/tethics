import { readFile } from "node:fs/promises";
import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { decodeBase58, encodeBase58, isValidSolanaAddress } from "./base58.js";

export interface SolanaKeypairLike {
  publicKey: string;
  secretKey: Uint8Array;
}

export async function loadSolanaKeypairFromFile(path: string): Promise<SolanaKeypairLike> {
  const raw = (await readFile(path, "utf8")).trim();
  return loadSolanaKeypairFromString(raw);
}

export function loadSolanaKeypairFromString(value: string): SolanaKeypairLike {
  const trimmed = value.trim();
  const secretKey = trimmed.startsWith("[")
    ? parseJsonSecretKey(trimmed)
    : decodeBase58(trimmed);

  return deriveKeypair(secretKey);
}

export function deriveKeypair(secretKey: Uint8Array): SolanaKeypairLike {
  const seed = getSeed(secretKey);
  if (seed.length !== 32) {
    throw new Error("Expected a Solana secret key of 32-byte seed or 64-byte secret key");
  }

  const privateKey = createPrivateKey({
    key: pkcs8FromEd25519Seed(seed),
    format: "der",
    type: "pkcs8",
  });
  const publicKeyDer = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });
  const publicKeyBytes = extractEd25519PublicKey(publicKeyDer);
  const publicKey = encodeBase58(publicKeyBytes);
  if (!isValidSolanaAddress(publicKey)) {
    throw new Error("Derived invalid Solana public key");
  }

  return {
    publicKey,
    secretKey: seed,
  };
}

export function signMessage(payload: Uint8Array, secretKey: Uint8Array): string {
  const seed = getSeed(secretKey);
  const signature = cryptoSign(
    null,
    Buffer.from(payload),
    createPrivateKey({
      key: pkcs8FromEd25519Seed(seed),
      format: "der",
      type: "pkcs8",
    }),
  );
  return encodeBase58(signature);
}

export function verifyMessage(payload: Uint8Array, signature: string, publicKey: string): boolean {
  return cryptoVerify(
    null,
    Buffer.from(payload),
    {
      key: spkiFromEd25519PublicKey(decodeBase58(publicKey)),
      format: "der",
      type: "spki",
    },
    Buffer.from(decodeBase58(signature)),
  );
}

function getSeed(secretKey: Uint8Array): Uint8Array {
  if (secretKey.length === 32) return secretKey;
  if (secretKey.length === 64) return secretKey.slice(0, 32);
  throw new Error("Expected a Solana secret key of 32-byte seed or 64-byte secret key");
}

function pkcs8FromEd25519Seed(seed: Uint8Array): Buffer {
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return Buffer.concat([prefix, Buffer.from(seed)]);
}

function spkiFromEd25519PublicKey(publicKey: Uint8Array): Buffer {
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return Buffer.concat([prefix, Buffer.from(publicKey)]);
}

function extractEd25519PublicKey(der: string | Buffer): Uint8Array {
  const buffer = Buffer.isBuffer(der) ? der : Buffer.from(der);
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  if (buffer.length !== prefix.length + 32 || !buffer.subarray(0, prefix.length).equals(prefix)) {
    throw new Error("Unexpected Ed25519 public key encoding");
  }
  return new Uint8Array(buffer.subarray(prefix.length));
}

function parseJsonSecretKey(value: string): Uint8Array {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Secret key JSON must be an array of bytes");
  }
  const bytes = Uint8Array.from(parsed.map((entry) => Number(entry)));
  if (bytes.some((entry) => Number.isNaN(entry) || entry < 0 || entry > 255)) {
    throw new Error("Secret key JSON contains invalid byte values");
  }
  return bytes;
}
