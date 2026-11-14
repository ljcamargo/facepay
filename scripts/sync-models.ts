/**
 * Downloads the face-engine model files into apps/web/public/models/human/.
 *
 *   bun run models:sync            # fetch what is missing
 *   bun run models:sync --force    # re-download everything
 *   bun run models:sync --check    # verify without network
 *
 * Models are gitignored (≈14 MB). Netlify runs this before `next build`.
 * Licences: FaceRes Apache-2.0, MediaPipe Apache-2.0; see docs/06 §10.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEST = path.join(import.meta.dir, '..', 'apps', 'web', 'public', 'models', 'human');
const BASE = 'https://raw.githubusercontent.com/vladmandic/human-models/main/models/';

// Face pipeline + optional hands. Keep in sync with human-engine.ts.
const MODELS = [
  'blazeface',        // the file Human requests by default
  'blazeface-back',
  'facemesh',
  'faceres',
  'antispoof',
  'liveness',
  'handtrack',
  'handlandmark-lite',
  'handskeleton',
];

const force = process.argv.includes('--force');
const checkOnly = process.argv.includes('--check');

async function exists(file: string): Promise<number | null> {
  try {
    const info = await stat(file);
    return info.size;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(DEST, { recursive: true });

  let missing = 0;
  let total = 0;

  for (const model of MODELS) {
    for (const ext of ['json', 'bin']) {
      const name = `${model}.${ext}`;
      const target = path.join(DEST, name);
      const size = await exists(target);

      if (size !== null && !force) {
        total += size;
        continue;
      }
      if (checkOnly) {
        console.log(`missing ${name}`);
        missing += 1;
        continue;
      }

      const res = await fetch(BASE + name);
      if (!res.ok) {
        console.error(`failed ${name}: HTTP ${res.status}`);
        missing += 1;
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      await writeFile(target, bytes);
      const sha = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      console.log(`${name.padEnd(24)} ${(bytes.length / 1e6).toFixed(2)} MB  sha256:${sha}`);
      total += bytes.length;
    }
  }

  if (missing > 0) {
    console.error(`\n${missing} file(s) missing.`);
    process.exit(1);
  }

  // Sanity check: the models directory should weigh roughly 14 MB.
  const probe = await readFile(path.join(DEST, 'faceres.bin')).catch(() => null);
  if (!checkOnly && !probe) {
    console.error('faceres.bin is not readable after sync');
    process.exit(1);
  }

  console.log(`\nmodels ready in ${DEST} (${(total / 1e6).toFixed(1)} MB)`);
}

await main();
