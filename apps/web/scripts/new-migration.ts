/**
 * Deliberately diffs schema.prisma at the base ref (`--from-schema`), never the
 * live DB — live introspection hits Prisma P4002 on Supabase's `public → auth`
 * FK (ADR 0004). A second migration stacked on one branch re-emits the first:
 * pass `--base=<commit that added the previous one>`.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

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

const webDir = join(__dirname, '..');
const repoRoot = join(webDir, '..', '..');
const dbDir = join(repoRoot, 'packages', 'db');
const relSchema = join('packages', 'db', 'prisma', 'schema.prisma');
const schemaPath = join(repoRoot, relSchema);
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

// `supabase db push` refuses versions below the remote head — an older stamp
// merges green and silently never applies to prod (bit twice), hence the clamp.
const d = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
let timestamp =
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
let baseFiles: string[] = [];
try {
  baseFiles = execFileSync(
    'git',
    ['ls-tree', '--name-only', baseRef, 'supabase/migrations/'],
    { cwd: repoRoot, encoding: 'utf8' }
  ).split('\n');
} catch {
  // No usable baseRef (fresh clone, --init): clamp against disk alone.
}
const head = baseFiles
  .concat(existsSync(migrationsDir) ? readdirSync(migrationsDir) : [])
  .map((f) => basename(f).match(/^(\d{14})_/)?.[1])
  .filter((v): v is string => !!v)
  .sort()
  .pop();
if (head && timestamp <= head) timestamp = String(Number(head) + 1);
const outFile = join(migrationsDir, `${timestamp}_${name}.sql`);

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
