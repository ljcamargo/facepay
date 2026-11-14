import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LEGAL_DOC_VERSION } from '@facepay/shared';

/**
 * Server-only. The consent evidence must point at the exact text the customer
 * saw, so we hash the same markdown file the app renders.
 */
export interface LegalHashes {
  version: string;
  privacy: string;
  biometricConsent: string;
}

async function hashDoc(slug: string): Promise<string> {
  const file = path.join(process.cwd(), 'content', 'legal', `${slug}.md`);
  const body = await readFile(file, 'utf8');
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export async function legalHashes(): Promise<LegalHashes> {
  const [privacy, biometricConsent] = await Promise.all([
    hashDoc('privacy'),
    hashDoc('biometric-consent'),
  ]);
  return { version: LEGAL_DOC_VERSION, privacy, biometricConsent };
}
