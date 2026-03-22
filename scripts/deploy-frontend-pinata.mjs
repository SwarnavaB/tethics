import { readFile, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { PinataSDK } from 'pinata';

const frontendRoot = resolve(process.cwd(), 'frontend');
const pinataJwt = process.env.PINATA_JWT || '';

if (!pinataJwt) {
  throw new Error('Missing PINATA_JWT.');
}

if (!statSync(frontendRoot).isDirectory()) {
  throw new Error(`Frontend directory not found: ${frontendRoot}`);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    } else {
      out.push(full);
    }
  }
  return out.sort();
}

async function buildFileArray() {
  const files = await walk(frontendRoot);
  return Promise.all(
    files.map(async (filePath) => {
      const relPath = relative(frontendRoot, filePath).replaceAll('\\', '/');
      return new File([await readFile(filePath)], relPath);
    }),
  );
}

async function main() {
  const pinata = new PinataSDK({ pinataJwt });
  const fileArray = await buildFileArray();
  const upload = await pinata.upload.public
    .fileArray(fileArray)
    .name(`tethics-frontend-${new Date().toISOString()}`);

  process.stdout.write(`${JSON.stringify({
    cid: upload.cid,
    id: upload.id,
    size: upload.size,
    files: upload.number_of_files,
    gatewayUrl: `https://gateway.pinata.cloud/ipfs/${upload.cid}/`,
    appUrl: `https://gateway.pinata.cloud/ipfs/${upload.cid}/app.html`,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exit(1);
});
