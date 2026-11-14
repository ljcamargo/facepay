/**
 * Fails the Netlify build when the public Supabase configuration is missing.
 * Better a red build than a deployed app that silently cannot sign anyone in.
 */
import { existsSync, readFileSync } from 'node:fs';

// On Netlify the values come from project env vars. Locally they live in
// apps/web/.env.local, which Next reads but a plain `bun run` does not.
const localEnv = 'apps/web/.env.local';
if (existsSync(localEnv)) {
  for (const line of readFileSync(localEnv, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    const key = match?.[1];
    if (key && !process.env[key]) process.env[key] = match?.[2] ?? '';
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const problems: string[] = [];

if (!url) problems.push('NEXT_PUBLIC_SUPABASE_URL is missing');
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
  problems.push(`NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase URL: ${url}`);
}

if (!anon) problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
else if (anon.startsWith('sb_secret') || anon.includes('service_role')) {
  problems.push('The key looks like a secret. Only the anon/publishable key may be public.');
}

if (problems.length > 0) {
  console.error('Environment check failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  console.error('\nSet these in Netlify → Project configuration → Environment variables.');
  process.exit(1);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (appUrl && !appUrl.startsWith('https://') && !appUrl.includes('localhost')) {
  console.warn(`NEXT_PUBLIC_APP_URL is not HTTPS: ${appUrl}`);
}

console.log(`Environment OK · supabase ${url} · app ${appUrl ?? '(unset)'}`);
