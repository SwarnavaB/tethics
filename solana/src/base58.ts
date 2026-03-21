const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58;
const ALPHABET_MAP = new Map<string, number>(
  Array.from(ALPHABET).map((char, index) => [char, index]),
);

export function decodeBase58(value: string): Uint8Array {
  if (value.length === 0) return new Uint8Array();

  const bytes: number[] = [0];
  for (const char of value) {
    const carryBase = ALPHABET_MAP.get(char);
    if (carryBase === undefined) throw new Error(`Invalid base58 character: ${char}`);

    let carry = carryBase;
    for (let i = 0; i < bytes.length; i++) {
      const next = bytes[i] * BASE + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      const next = digits[i] * 256 + carry;
      digits[i] = next % BASE;
      carry = Math.floor(next / BASE);
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = Math.floor(carry / BASE);
    }
  }

  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }

  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

export function isValidSolanaAddress(value: string): boolean {
  try {
    return decodeBase58(value).length === 32;
  } catch {
    return false;
  }
}
