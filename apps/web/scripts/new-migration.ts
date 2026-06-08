/**
 * Generate a Supabase-format migration from the current Prisma schema.
 *
 * Usage:
 *   yarn db:new <name>          # diff: current branch -> schema.prisma
 *   yarn db:new <name> --init   # diff: empty          -> schema.prisma  (baseline, Phase 0)
 *
 * Writes supabase/migrations/<timestamp>_<name>.sql using `prisma migrate diff`.
 * Plain SQL is the source of truth (docs/adr/0004-supabase-migrations-as-source.md);
 * Prisma is only the generator. Review the emitted SQL before committing.
 *
 * Prisma 7: the diff baseline connection is read from `prisma.config.ts`
 * (`datasource.url` = env POSTGRES_URL_NON_POOLING, the direct 5432 connection
 * to the branch you're working on) via `--from-config-datasource`. Set that env
 * var in .env (loaded here by `tsx --env-file` and by prisma.config.ts's dotenv).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const rawName = process.argv[2];
const isInit = process.argv.includes('--init');

if (!rawName || rawName.startsWith('--')) {
  console.error('Usage: yarn db:new <name> [--init]');
  process.exit(1);
}

const name = rawName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_|_$/g, '');

// Supabase migration filename convention: <YYYYMMDDHHMMSS>_<name>.sql
const d = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const timestamp =
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

const webDir = join(__dirname, '..');
const schemaPath = join(webDir, 'prisma', 'schema.prisma');
const migrationsDir = join(webDir, '..', '..', 'supabase', 'migrations');
const outFile = join(migrationsDir, `${timestamp}_${name}.sql`);

// Prisma 7 flags: the baseline comes from prisma.config.ts (`--from-config-datasource`),
// not `--from-url`; the target datamodel flag is `--to-schema` (was `--to-schema-datamodel`).
if (!isInit && !process.env.POSTGRES_URL_NON_POOLING) {
  console.error(
    "POSTGRES_URL_NON_POOLING is required (direct 5432 connection to the branch you're working on); prisma.config.ts reads it as the diff baseline."
  );
  console.error(
    'Use --init for the first baseline migration (diff from empty).'
  );
  process.exit(1);
}

const fromArgs = isInit ? ['--from-empty'] : ['--from-config-datasource'];

const sql = execFileSync(
  'npx',
  [
    'prisma',
    'migrate',
    'diff',
    ...fromArgs,
    '--to-schema',
    schemaPath,
    '--script',
  ],
  { cwd: webDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
);

if (
  !sql.trim() ||
  /^\s*--\s*This is an empty migration\.?\s*$/im.test(sql.trim())
) {
  console.log('No schema changes detected — nothing to write.');
  process.exit(0);
}

mkdirSync(migrationsDir, { recursive: true });
writeFileSync(outFile, sql);
console.log(`Wrote ${outFile}`);
console.log(
  'Review the SQL, then run `yarn db:apply` to apply it to your dev/local DB.'
);
