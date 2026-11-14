/**
 * Runs supabase/tests/*.sql against a Postgres database without Docker.
 *
 *   SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@aws-0-...pooler.supabase.com:5432/postgres' \
 *     bun run test:rls:remote
 *
 * Why this exists: `supabase test db --remote` still shells out to Docker to run
 * pg_prove. pgTAP is plain SQL, so a normal client can execute it and read the
 * TAP lines it prints.
 */
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is required (use the pooler URL, never commit it)');
  process.exit(2);
}

const files = process.argv.slice(2);
const targets = files.length > 0 ? files : ['supabase/tests/rls.test.sql'];

const sql = postgres(url, { max: 1, idle_timeout: 5, onnotice: () => {} });

let failures = 0;
let assertions = 0;

try {
  for (const file of targets) {
    const body = await Bun.file(file).text();
    console.log(`\n# ${file}`);
    const result = await sql.unsafe(body);
    const sets = Array.isArray(result) ? result : [result];

    for (const rows of sets) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const line = Object.values(row)
          .filter((v) => typeof v === 'string' && v.length > 0)
          .join(' ')
          .trim();
        if (!line) continue;
        if (/^(not ok|Bail out)/.test(line)) failures++;
        if (/^(ok|not ok) /.test(line)) assertions++;
        if (line.startsWith('#') || /^(ok|not ok|1\.\.)/.test(line)) console.log(line);
      }
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log(`\n${assertions} assertions, ${failures} failures`);
process.exit(failures > 0 ? 1 : 0);
