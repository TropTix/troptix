---
title: Firebase Storage → Supabase Storage (event flyer images)
status: proposed
created: 2026-06-13
tracking-issue: TBD
---

# Firebase Storage → Supabase Storage

Move the web app's only remaining Firebase dependency — **event flyer image storage** — onto Supabase Storage, migrate existing objects, and drop the `firebase` SDK from `apps/web`. Backing decision: [ADR 0016](../adr/0016-supabase-storage-for-event-images.md). Bucket + policies are plain SQL ([ADR 0004](../adr/0004-supabase-migrations-as-source.md)); the DB stores object **paths**, not URLs, so the serving hostname stays swappable.

## Why

Auth already moved to Supabase ([ADR 0015](../adr/0015-passwordless-auth-and-trigger-provisioning.md)); Storage is all that keeps Firebase alive in the web app. One image-upload feature does not justify a second vendor, a second SDK in the bundle, and a second secret set. Supabase already hosts Postgres + auth and ships S3-backed Storage with a CDN and image transforms.

## Scope (verified in-repo)

**In scope — all in `apps/web`:**

| Site                                                                        | Today                                                              | Role                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| `src/config.js`                                                             | `initializeApp` + `getStorage`                                     | Firebase init (storage only)                     |
| `src/app/organizer/events/_components/EventImageUpload.tsx`                 | `ref` / `uploadBytesResumable` / `getDownloadURL` / `deleteObject` | the **only** real upload/delete path             |
| `src/firebase/storage.ts`                                                   | `uploadFlyerToFirebase`                                            | **unused** helper — delete                       |
| `Events.imageUrl VARCHAR(2000)` (`packages/db/prisma/schema.prisma`)        | full `firebasestorage.googleapis.com` URL                          | persisted value → becomes a path                 |
| `next.config.js` `images.remotePatterns`                                    | allow-lists `firebasestorage.googleapis.com`                       | add Supabase host; drop Firebase host at the end |
| render sites: `orders/page.tsx`, organizer events list, `EventForm` preview | read `imageUrl` directly                                           | must wrap in `eventFlyerUrl()`                   |

**Out of scope:** `apps/organizer` (RN-Firebase **auth**, no Storage) is untouched. No Storage usage exists in `packages/*`.

**Already in place:** Supabase Storage enabled in `supabase/config.toml` (`[storage]`, 50 MiB cap, S3 protocol on); `@supabase/ssr` + `@supabase/supabase-js` installed; browser client at `src/lib/supabase/client.ts` using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## New env

- `SUPABASE_SECRET_KEY` — **server-only** (never `NEXT_PUBLIC_`), used solely by the migration script for privileged Storage writes + DB updates. Add to the migration runner's env and (later) document in `.env`.

## Phases (one PR each)

### PR 1 — Provision the bucket (SQL migration)

`supabase/migrations/<ts>_event_flyers_bucket.sql` (generated via the repo's `db:new` flow, reviewed, then `db:apply`):

- Insert the `event-flyers` bucket: `public = true`, `file_size_limit = 10485760` (10 MB), `allowed_mime_types = {image/jpeg,image/png,image/webp,image/avif,image/gif}`. Idempotent (`on conflict (id) do nothing`).
- RLS policies on `storage.objects`, all scoped to `bucket_id = 'event-flyers'`:
  - public `SELECT` (role `public`/`anon`);
  - `INSERT`, `UPDATE`, `DELETE` for role `authenticated`.
- **Gate:** apply on the persistent dev/staging branch ([ADR 0006](../adr/0006-hosted-branching-persistent-dev-branch.md)); confirm an authenticated client can upload and an anon client can read.

### PR 2 — Storage helpers

`apps/web/src/lib/supabase/storage.ts`:

- `BUCKET = 'event-flyers'`.
- `eventFlyerUrl(value: string | null | undefined): string | null` — the single URL-derivation point and the future custom-domain swap site. If `value` is already absolute (`http(s)://`, covers legacy Firebase rows) or falsy, return as-is; otherwise build the Supabase public URL from `client.storage.from(BUCKET).getPublicUrl(path)` (or the base constant).
- `uploadEventFlyer(file: File, onProgress?): Promise<string>` — upload to `event-flyers/<uuidv7>.<ext>` via the browser client, return the **path**. (Path uses a uuid because `eventId` does not exist at upload time — flyers are uploaded before the event row is created.)
- `deleteEventFlyer(path: string)` — `remove([path])`, tolerant of not-found.
- Unit-test `eventFlyerUrl()` pass-through + path-building ([ADR 0010](../adr/0010-vitest-for-packages.md) — vitest).

### PR 3 — Rewire the uploader + render sites

- `EventImageUpload.tsx`: replace all `firebase/storage` imports/calls with the PR-2 helpers. Preserve UX (preview, live progress, change/remove). `onUploadComplete` now emits a **path**; the local preview renders via `eventFlyerUrl()`. Remove the `event-images/${Date.now()}-...` path TODO.
- Render sites (`orders/page.tsx`, organizer events list, `EventForm` preview): wrap stored `imageUrl` in `eventFlyerUrl()`.
- `next.config.js`: **add** the Supabase Storage hostname (`<project-ref>.supabase.co`, `pathname: /storage/v1/object/public/**`) to `remotePatterns`. **Keep** `firebasestorage.googleapis.com` for now (un-migrated rows).
- **Gate:** upload a new flyer end-to-end on a preview deploy; confirm it lands in `event-flyers/`, the row stores a path, and it renders through `next/image`.

### PR 4 — Migrate existing objects

`scripts/migrate-firebase-storage-to-supabase.ts` (run with `tsx --env-file`):

- Read every `Events` row whose `imageUrl` matches `firebasestorage.googleapis.com`.
- For each: download via **firebase-admin** (existing `FIREBASE_SERVICE_ACCOUNT_KEY`) → upload to `event-flyers/<uuidv7>.<ext>` with the **Supabase secret key** → update `Events.imageUrl` to the new path.
- **`--dry-run` is the default** (report counts, no writes); `--commit` to apply. **Idempotent**: skip rows already holding a non-`http` path. Per-row try/catch; summary of migrated/skipped/failed.
- **Gate:** dry-run, then `--commit` on staging, eyeball a few event pages, then prod. `firebasestorage.googleapis.com` stays allow-listed and `eventFlyerUrl()` passes legacy URLs through, so partial migration never breaks rendering.

### PR 5 — Decommission Firebase

Only after PR 4 is verified in prod and a query confirms **no** `Events.imageUrl` still points at Firebase:

- Delete `src/config.js` (Firebase init) and `src/firebase/storage.ts`.
- Remove `firebase` from `apps/web/package.json`; reinstall lockfile.
- Remove `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_SERVICE_ACCOUNT_KEY*` from web env (Vercel + local `.env`).
- Remove the `firebasestorage.googleapis.com` entry from `next.config.js`.
- **Gate:** `grep -ri firebase apps/web/src` is clean of Storage refs; typecheck + build green.

## Custom domain (follow-up, not blocking)

When branding warrants: point `cdn.troptix.com` at Supabase Storage via a free Cloudflare CNAME proxy caching `/storage/v1/object/public/*` (or Supabase's paid custom-domain add-on), then change the one base constant in `eventFlyerUrl()`. No DB change — that is the payoff of storing paths.

## Rollback

- PRs 1–3 are additive; the Firebase host stays allow-listed, so reverting the uploader restores the old path with no data loss.
- PR 4 is reversible per-row (the Firebase objects are not deleted by the script); re-running with the inverse is unnecessary because legacy URLs still render.
- PR 5 is the point of no return — gated on a clean prod query.
