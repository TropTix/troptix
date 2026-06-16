/**
 * One-time data migration: copy event flyer images from Firebase Storage into
 * the Supabase `event-flyers` bucket, then rewrite `Events.imageUrl` from a full
 * Firebase download URL to a Supabase object PATH (ADR 0016).
 *
 * Backing plan: docs/plans/2026-06-firebase-storage-to-supabase.md (PR 4).
 * This is a single-use script — it (and the `migrate:storage` package.json
 * entry) is deleted in the PR5 decommission once prod is migrated.
 *
 * Design:
 * - Firebase objects are read via the download URLs already stored in the DB.
 *   Those are token-bearing and publicly fetchable, so no firebase-admin /
 *   service-account is needed — a plain `fetch` works.
 * - The DB read/update use the app's Prisma client (`@troptix/db`), which
 *   connects directly to Postgres as the app's DB role — bypassing RLS and the
 *   PostgREST/Data-API grants (revoked-by-default on newer projects). Reusing
 *   the app client also means zero extra dependencies for this script.
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
 * ⚠️  The Prisma client connects via the same DB env the web app uses (loaded
 *     from .env). Point .env at the branch you intend to migrate — staging
 *     first, then prod. Required Supabase env:
 *       NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 */
import { createClient } from '@supabase/supabase-js';
import prisma from '@troptix/db';
import { randomUUID } from 'node:crypto';

const COMMIT = process.argv.includes('--commit');
const BUCKET = 'event-flyers';
const FIREBASE_HOST = 'firebasestorage.googleapis.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error(
    'Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.'
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

  try {
    // `contains` on a nullable column only matches non-null values, so migrated
    // rows (bare paths) are excluded — this is the idempotency guard.
    const rows = await prisma.events.findMany({
      where: { imageUrl: { contains: FIREBASE_HOST } },
      select: { id: true, imageUrl: true },
    });

    console.log(
      `${COMMIT ? 'COMMIT' : 'DRY RUN'} — found ${rows.length} event(s) with Firebase image URLs.\n`
    );

    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      const url = row.imageUrl;
      if (!url) continue; // unreachable given the filter, but satisfies the type
      try {
        const res = await fetch(url);
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

          await prisma.events.update({
            where: { id: row.id },
            data: { imageUrl: path },
          });
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
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
