const STORAGE_KEY = 'tethics.ipfsSettings';
const TOKEN_STORAGE_KEY = 'tethics.ipfsToken';

export const IPFS_PROVIDER_PRESETS = {
  pinata: {
    id: 'pinata',
    label: 'Pinata',
    endpoint: 'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    authLabel: 'JWT',
    mode: 'pinata-json',
  },
  kubo: {
    id: 'kubo',
    label: 'Generic IPFS API',
    endpoint: 'http://127.0.0.1:5001/api/v0/add',
    authLabel: 'Bearer token',
    mode: 'ipfs-add',
  },
};

export function loadIpfsSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const sessionToken = sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
    const provider = parsed.provider && IPFS_PROVIDER_PRESETS[parsed.provider]
      ? parsed.provider
      : 'pinata';
    return {
      provider,
      endpoint: parsed.endpoint || IPFS_PROVIDER_PRESETS[provider].endpoint,
      token: sessionToken,
      gateway: parsed.gateway || 'https://ipfs.io/ipfs/',
    };
  } catch {
    return {
      provider: 'pinata',
      endpoint: IPFS_PROVIDER_PRESETS.pinata.endpoint,
      token: sessionStorage.getItem(TOKEN_STORAGE_KEY) || '',
      gateway: 'https://ipfs.io/ipfs/',
    };
  }
}

export function saveIpfsSettings(settings) {
  const { token = '', ...persisted } = settings || {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function getAuthHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function extractCid(payload) {
  return payload?.IpfsHash || payload?.Hash || payload?.cid || payload?.value?.cid || null;
}

export async function uploadJsonArtifact({ artifact, fileName, settings }) {
  const provider = IPFS_PROVIDER_PRESETS[settings.provider] || IPFS_PROVIDER_PRESETS.pinata;
  let response;

  if (provider.mode === 'pinata-json') {
    response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(settings.token),
      },
      body: JSON.stringify({
        pinataMetadata: {
          name: fileName,
        },
        pinataContent: artifact,
      }),
    });
  } else {
    const form = new FormData();
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
    form.append('file', blob, fileName);

    response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(settings.token),
      },
      body: form,
    });
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`IPFS upload failed: ${message || response.statusText}`);
  }

  const payload = await response.json();
  const cid = extractCid(payload);
  if (!cid) throw new Error('IPFS upload succeeded but no CID was returned');

  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: toGatewayUrl(`ipfs://${cid}`, settings.gateway),
    provider: provider.label,
    raw: payload,
  };
}

export function toGatewayUrl(uri, gatewayBase) {
  if (!uri) return '';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (!uri.startsWith('ipfs://')) return uri;

  const normalizedGateway = gatewayBase.endsWith('/') ? gatewayBase : `${gatewayBase}/`;
  return `${normalizedGateway}${uri.slice('ipfs://'.length)}`;
}
