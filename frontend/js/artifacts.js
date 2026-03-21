function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const next = value[key];
        if (next !== undefined) {
          acc[key] = sortValue(next);
        }
        return acc;
      }, {});
  }

  return value;
}

export function canonicalizeArtifact(value) {
  return JSON.stringify(sortValue(value));
}

export function prettyPrintArtifact(value) {
  return JSON.stringify(sortValue(value), null, 2);
}

export async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `0x${Array.from(new Uint8Array(digest)).map((entry) => entry.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyArtifactIntegrity(value, expectedHash, hasher) {
  const canonical = canonicalizeArtifact(value);
  const actualHash = await hasher(canonical);

  return {
    canonical,
    actualHash,
    expectedHash,
    matches: actualHash.toLowerCase() === String(expectedHash || '').toLowerCase(),
  };
}
