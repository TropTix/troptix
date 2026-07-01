/**
 * Generate a Supabase-format migration from the current Prisma schema.
 *
 * Usage:
 *   yarn db:new <name>                 # diff: schema.prisma @ origin/main -> working schema.prisma
 *   yarn db:new <name> --base=<ref>    # diff against a different git ref (e.g. HEAD, a tag)
 *   yarn db:new <name> --init          # diff: empty -> schema.prisma  (first baseline migration)
 *
 * Writes supabase/migrations/<timestamp>_<name>.sql using `prisma migrate diff`.
 * Plain SQL is the source of truth (docs/adr/0004-supabase-migrations-as-source.md);
 * Prisma is only the generator. Review the emitted SQL before committing.
 *
 * The baseline is a **schema file at a git ref** (`--from-schema`), NOT the live
 * database (`--from-config-datasource`). This is fully offline — no DB, no
 * POSTGRES_URL — and sidesteps Prisma's P4002 on Supabase's `public → auth`
 * cross-schema FK (which only bites live-DB introspection). It relies on the
 * convention that schema.prisma on the base ref reflects all applied migrations
 * (true when every schema change ships with a migration).
 *
 * Caveat — stacked migrations on one branch: the default base (origin/main)
 * produces the delta since main, so a *second* migration on the same branch
 * would re-emit the first. For that case pass `--base=<commit>` pointing at the
 * commit where the previous migration was added.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rawName = process.argv[2];
const isInit = process.argv.includes('--init');
const baseArg = process.argv
  .find((a) => a.startsWith('--base='))
  ?.split('=')[1];
const baseRef = baseArg ?? process.env.MIGRATION_BASE_REF ?? 'origin/main';

if (!rawName || rawName.startsWith('--')) {
  console.error('Usage: yarn db:new <name> [--base=<ref>] [--init]');
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
const repoRoot = join(webDir, '..', '..');
const dbDir = join(repoRoot, 'packages', 'db');
const relSchema = join('packages', 'db', 'prisma', 'schema.prisma');
const schemaPath = join(repoRoot, relSchema);
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const outFile = join(migrationsDir, `${timestamp}_${name}.sql`);

// Baseline: `--from-empty` for the first migration, else the schema file as of
// `baseRef`, extracted to a temp file for `--from-schema` (a pure datamodel diff,
// no database needed).
let baselineFile: string | undefined;
let fromArgs: string[];
if (isInit) {
  fromArgs = ['--from-empty'];
} else {
  let baseline: string;
  try {
    baseline = execFileSync('git', ['show', `${baseRef}:${relSchema}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch {
    console.error(
      `Could not read ${relSchema} at ref '${baseRef}'. Fetch it (git fetch), pass --base=<ref>, or use --init for the first migration.`
    );
    process.exit(1);
  }
  baselineFile = join(tmpdir(), `troptix-baseline-${timestamp}.prisma`);
  writeFileSync(baselineFile, baseline);
  fromArgs = ['--from-schema', baselineFile];
}

try {
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
    { cwd: dbDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
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
  console.log(`Wrote ${outFile} (baseline: ${isInit ? 'empty' : baseRef})`);
  console.log('Review the SQL, then run `yarn db:apply` to apply it.');
} finally {
  if (baselineFile) rmSync(baselineFile, { force: true });
}
