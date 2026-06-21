# 16. Supabase Storage for event images (paths-in-DB, public bucket)

- **Status:** Proposed
- **Date:** 2026-06-13
- **Relates to:** [ADR 0011](0011-supabase-auth-identity.md) / [ADR 0015](0015-passwordless-auth-and-trigger-provisioning.md) (the Firebase → Supabase auth move) and [ADR 0004](0004-supabase-migrations-as-source.md) (plain SQL is the source of truth). This is the **last** Firebase dependency in `apps/web`; landing it lets us drop the `firebase` SDK from the web app entirely.

## Context

Firebase is now kept _only_ for Storage — auth moved to Supabase ([ADR 0015](0015-passwordless-auth-and-trigger-provisioning.md)). Storage has exactly one consumer in the web app: organizer **event flyer images**, uploaded client-side in `EventImageUpload.tsx` (`uploadBytesResumable` → `getDownloadURL`), with the **full** `firebasestorage.googleapis.com` download URL persisted into `Events.imageUrl VARCHAR(2000)`. There is one stray unused helper (`src/firebase/storage.ts`) and one allow-listed image host in `next.config.js`. The mobile app (`apps/organizer`) uses React-Native Firebase for auth and does **not** use Storage — it is out of scope and untouched here.

Keeping Firebase alive for a single image upload means a second vendor, a second SDK in the web bundle, a second set of secrets, and a JS dependency we otherwise no longer need. Supabase already hosts our Postgres and auth and ships an S3-backed Storage product with a built-in CDN and image transforms.

Two sub-decisions shaped this ADR:

1. **What to store in the DB — full URL or path?** The current code stores the full Firebase URL. That hard-codes the serving hostname into every row, so any future move (custom domain, CDN swap, even Supabase project migration) becomes a data migration.
2. **How "from our domain" should files look.** Supabase's default public URL is `https://<project-ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`. The goal is for assets to eventually appear under `troptix.com`/`cdn.troptix.com` without churn.

## Decision

**1. Persist the storage _path_, not a URL.** `Events.imageUrl` holds an opaque object path (e.g. `event-flyers/<uuidv7>.jpg`). The public URL is derived at **render time** by a single helper, `eventFlyerUrl(path)`, built from one base constant. The column keeps its name and `VARCHAR(2000)` type (no schema change). This makes the "serve from our domain" change a one-line config edit with **zero data migration** — see decision 3.

**2. One public bucket, `event-flyers`, provisioned by migration.** Flyers are public marketing images shown on public event pages, so a **public** bucket is correct: free CDN caching, image transformations, no signed-URL round-trips. The bucket and its RLS policies are created in a Supabase SQL migration ([ADR 0004](0004-supabase-migrations-as-source.md)), not hand-clicked in the dashboard. RLS: public `SELECT`; `INSERT`/`UPDATE`/`DELETE` restricted to `authenticated` and scoped to the bucket. Constraints (10 MB limit, `image/*` mime allowlist) live on the bucket row.

**3. Default Supabase URL now; custom domain later, behind the helper.** Ship on the default `<project-ref>.supabase.co` host. When branding warrants it, point `cdn.troptix.com` at Supabase Storage (a free Cloudflare CNAME proxy caching `/storage/v1/object/public/*`, or Supabase's paid custom-domain add-on) and change the one base constant in `eventFlyerUrl()`. Because the DB stores paths, no rows change.

**4. Direct client upload governed by RLS.** The browser uploads straight to Supabase with the publishable key (matching the existing auth client pattern), with writes gated by the bucket's `authenticated` RLS policy. We deliberately do **not** route flyer uploads through a tRPC signed-upload mutation: for inherently-public images the RLS-governed direct upload is the standard Supabase pattern, preserves the current live-progress UX, and adds no round-trip. This is a scoped exception to [ADR 0013](0013-authorization-in-the-service-layer.md) (authz in the service layer) — justified because storage RLS _is_ the enforcement boundary here and no business invariant rides on a flyer upload. If flyer writes ever need richer authorization (per-event ownership, quotas), revisit with a signed-URL mutation.

**5. Fully decommission Firebase from `apps/web`.** After the data migration is verified: delete the Firebase init (`config.js`) and the unused `firebase/storage.ts`, drop the `firebase` dependency from `apps/web/package.json`, remove `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_SERVICE_ACCOUNT_KEY*` from the web env, and remove the `firebasestorage.googleapis.com` entry from `next.config.js`.

## Consequences

- **Good:** one vendor for DB + auth + storage; the `firebase` SDK leaves the web bundle; assets are CDN-served with optional on-the-fly transforms; the serving hostname is swappable for free with no data migration; bucket + policies are versioned SQL, reproducible on preview branches.
- **Trade-off:** `Events.imageUrl` now holds a path, not a clickable URL — every render site must pass through `eventFlyerUrl()`. Mitigated by making the helper tolerant of already-absolute values (legacy/full URLs pass through untouched), so the app is correct during the migration window. A new server-only secret (`SUPABASE_SECRET_KEY`) is introduced for the migration script.
- **Risk — data migration:** existing rows hold Firebase URLs that must be copied object-by-object into Supabase and rewritten to paths. Handled by an idempotent, dry-run-first script (firebase-admin read → Supabase secret-key write → `Events.imageUrl` rewrite), run on the staging branch before prod. `firebasestorage.googleapis.com` stays allow-listed in `next.config.js` and `eventFlyerUrl()` passes legacy URLs through until the migration completes, so any un-migrated row still renders.
- **Risk — RLS scope:** the `authenticated` write policy lets any signed-in user upload to the bucket (not just event owners). Acceptable for public flyers at current scale; tighten to ownership only if abuse appears.
