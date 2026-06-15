/**
 * One-time data migration: copy event flyer images from Firebase Storage into
 * the Supabase `event-flyers` bucket, then rewrite `Events.imageUrl` from a full
 * Firebase download URL to a Supabase object PATH (ADR 0016).
 *
 * Backing plan: docs/plans/2026-06-firebase-storage-to-supabase.md (PR 4).
 *
 * Design:
 * - Firebase objects are read via the download URLs already stored in the DB.
 *   Those are token-bearing and publicly fetchable, so no firebase-admin /
 *   service-account is needed — a plain `fetch` works.
 * - The DB read/update go over a direct Postgres connection (same
 *   POSTGRES_URL_NON_POOLING the other db scripts use). That connects as a role
 *   that bypasses RLS and does NOT depend on PostgREST/Data-API grants — which
 *   are revoked-by-default on newer projects (see supabase/config.toml).
 * - The storage upload uses the Supabase SECRET key (bypasses storage RLS).
 *   NEVER expose this key to the browser.
 * - Idempotent: the query only matches rows whose imageUrl still points at
 *   Firebase, so already-migrated rows (bare paths) are skipped and a second
 *   run is a no-op.
 *
 * Usage (from apps/web):
 *   yarn migrate:storage            # dry run — reports what would change
 *   yarn migrate:storage --commit   # apply: upload + rewrite imageUrl
 *
 * ⚠️  Point POSTGRES_URL_NON_POOLING at the branch you intend to migrate
 *     (staging first, then prod). Required env (loaded via `tsx --env-file=.env`):
 *       POSTGRES_URL_NON_POOLING, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const COMMIT = process.argv.includes('--commit');
const BUCKET = 'event-flyers';
const FIREBASE_HOST = 'firebasestorage.googleapis.com';

const DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    'Missing env: POSTGRES_URL_NON_POOLING, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.'
  );
  process.exit(1);
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

async function main() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    const { rows } = await db.query<{ id: string; imageUrl: string }>(
      `select id, "imageUrl" from "Events" where "imageUrl" like $1`,
      [`%${FIREBASE_HOST}%`]
    );

    console.log(
      `${COMMIT ? 'COMMIT' : 'DRY RUN'} — found ${rows.length} event(s) with Firebase image URLs.\n`
    );

    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const res = await fetch(row.imageUrl);
        if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
        const contentType = res.headers.get('content-type') ?? 'image/jpeg';
        const ext =
          EXT_BY_CONTENT_TYPE[contentType.split(';')[0].trim()] ?? 'jpg';
        const buffer = Buffer.from(await res.arrayBuffer());
        const path = `${randomUUID()}.${ext}`;

        if (COMMIT) {
          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType, upsert: false });
          if (uploadError) throw uploadError;

          await db.query(`update "Events" set "imageUrl" = $1 where id = $2`, [
            path,
            row.id,
          ]);
        }

        migrated++;
        console.log(
          `${COMMIT ? '✓ migrated' : '· would migrate'} ${row.id} → ${path}`
        );
      } catch (e) {
        failed++;
        console.error(
          `✗ FAILED ${row.id}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    console.log(
      `\n${COMMIT ? 'APPLIED' : 'DRY RUN COMPLETE'} — ${migrated} ${COMMIT ? 'migrated' : 'to migrate'}, ${failed} failed, ${rows.length} total.`
    );
    if (!COMMIT && rows.length > 0) {
      console.log('Re-run with --commit to apply.');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
