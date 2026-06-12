# Plan 011: Migrate event-image uploads to Supabase Storage; remove the Firebase SDK

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/src/config.js apps/web/src/firebase apps/web/src/app/organizer/events/_components/EventImageUpload.tsx apps/web/package.json`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (user-facing upload flow; existing image URLs must keep rendering)
- **Depends on**: none (009 interacts: env vars change)
- **Category**: migration / tech-debt
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/316

## Why this matters

After the Supabase Auth cutover (#308), Firebase survives in `apps/web` for exactly one feature: the event-flyer upload in `EventImageUpload.tsx`. That costs the whole `firebase` SDK in the client bundle, seven `NEXT_PUBLIC_FIREBASE_*` env vars, and a second cloud provider to operate — for one component. Supabase Storage is already in the stack (same project as auth/DB). Migrating the upload deletes the last Firebase dependency from the web app.

Important consequence the maintainer accepted implicitly: **existing** event images live at Firebase Storage URLs stored in `Events.imageUrl`. Those URLs keep working as long as the Firebase project exists; this plan does NOT backfill them (see Maintenance notes).

## Current state

- `apps/web/src/config.js` — initializes Firebase; header comment: "Firebase is kept ONLY for Storage (event image uploads). Auth moved to Supabase". Exports `storage`.
- `apps/web/src/app/organizer/events/_components/EventImageUpload.tsx` — `'use client'` component; imports `{ storage } from '@/config'` and `ref, uploadBytesResumable, getDownloadURL, deleteObject, StorageError` from `firebase/storage`. It uploads with progress (`uploadBytesResumable` → progress callback → `getDownloadURL`), supports delete (`deleteObject`), and calls `onUploadComplete(url | null)` — the parent (`EventForm.tsx`) persists the URL string into `Events.imageUrl`.
- `apps/web/src/firebase/storage.ts` — `uploadFlyerToFirebase()`, **zero callers** (dead).
- `apps/web/package.json` — `"firebase": "^11.6.0"` in dependencies.
- Supabase client helpers exist at `apps/web/src/lib/supabase/` (browser + server clients, from the auth cutover) — reuse the browser client.
- Schema migration convention (ADR 0004): SQL files in `supabase/migrations/` are the source of truth; generated via `yarn workspace web db:new <name>` — but **storage buckets/policies** are Supabase-level SQL you write by hand in a migration file (they're not in the Prisma schema). Exemplar migration format: `supabase/migrations/20260605205155_enable_rls.sql`.

## Commands you will need

| Purpose       | Command                                                                                | Expected on success |
| ------------- | -------------------------------------------------------------------------------------- | ------------------- |
| Typecheck     | `yarn typecheck`                                                                       | exit 0              |
| Web tests     | `yarn workspace web test`                                                              | exit 0              |
| Lint          | `yarn workspace web lint`                                                              | no new errors       |
| Firebase gone | `grep -rn "firebase" apps/web/src --include="*.ts" --include="*.tsx" --include="*.js"` | 0 matches           |

## Scope

**In scope**:

- `apps/web/src/lib/supabase/storage.ts` (create — upload/delete helpers)
- `apps/web/src/app/organizer/events/_components/EventImageUpload.tsx` (swap internals; keep the component's props contract `{ currentImageUrl, onUploadComplete }` identical)
- `apps/web/src/config.js` (delete), `apps/web/src/firebase/` (delete)
- `apps/web/package.json` (remove `firebase`), root `yarn.lock` (regenerated)
- One new SQL migration under `supabase/migrations/` (bucket + policies)
- `apps/web/.env.example` (if plan 009 landed: drop the Firebase block, note the change)

**Out of scope**:

- Backfilling existing Firebase-hosted `imageUrl`s (deferred — see Maintenance notes).
- `apps/organizer` (its Firebase usage is auth, separately planned).
- `next.config.js` image domains — EXCEPT: check whether `next/image` allows the new Supabase host; if `images.remotePatterns`/`domains` exists and lists the Firebase host, ADD the Supabase host (do not remove Firebase's — old images still render from there).

## Git workflow

- Branch: `advisor/011-supabase-storage`
- Commit per step. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the bucket via migration

New file `supabase/migrations/<timestamp>_event_flyers_bucket.sql` (generate the timestamp to match sibling format `YYYYMMDDHHMMSS`):

```sql
insert into storage.buckets (id, name, public)
values ('event-flyers', 'event-flyers', true)
on conflict (id) do nothing;

-- Public read; writes only for authenticated users.
create policy "event_flyers_public_read" on storage.objects
  for select using (bucket_id = 'event-flyers');

create policy "event_flyers_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'event-flyers');

create policy "event_flyers_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'event-flyers');
```

Apply with `yarn workspace web db:apply` if env is configured; otherwise note that git-sync applies it on merge.

**Verify**: file exists, names follow the sibling timestamp convention.

### Step 2: Write the storage helper

`apps/web/src/lib/supabase/storage.ts` — using the existing browser client factory in `apps/web/src/lib/supabase/` (read that directory first and import the client the same way other client components do):

- `uploadEventFlyer(eventId: string, file: File): Promise<string>` — path `${eventId}/${crypto.randomUUID()}-${file.name}`, `supabase.storage.from('event-flyers').upload(path, file)`, then `getPublicUrl(path).data.publicUrl` as the return.
- `deleteEventFlyer(publicUrl: string): Promise<void>` — parse the object path from the public URL **only if** the URL belongs to the Supabase host; silently no-op for foreign (Firebase) URLs so deleting an old image never throws.

Note: Supabase JS uploads don't expose granular progress like `uploadBytesResumable`. The component currently shows a progress bar — replace it with an indeterminate "Uploading…" state (the `Progress` component without a percentage, or the existing spinner pattern). Flag this UX downgrade in your summary.

**Verify**: `yarn typecheck` → exit 0.

### Step 3: Swap EventImageUpload internals

Replace the firebase imports/calls in `EventImageUpload.tsx` with the Step-2 helpers, preserving: file-type/size validation as-is, preview behavior, the `onUploadComplete(url)` and remove → `onUploadComplete(null)` contract, and error display (map thrown errors to the existing error state instead of `StorageError`).

**Verify**: `yarn typecheck && yarn workspace web lint` → no new errors.

### Step 4: Delete Firebase

Delete `apps/web/src/config.js` and `apps/web/src/firebase/`. Remove `"firebase"` from `apps/web/package.json`; run `yarn install`.

**Verify**: the "Firebase gone" grep → 0 matches; `yarn typecheck && yarn workspace web test` → exit 0.

### Step 5: next/image host check

Inspect `apps/web/next.config.js`. If it constrains image hosts, add the project's Supabase storage host (`<project-ref>.supabase.co` — find the ref in the `NEXT_PUBLIC_SUPABASE_URL` usage, never hardcode a guessed ref; if you can't determine it from the repo, use an env-derived pattern or STOP and ask).

**Verify**: `yarn typecheck` → exit 0.

### Step 6: Report operator actions

Summary must state: the seven `NEXT_PUBLIC_FIREBASE_*` env vars can be removed from Vercel **after** confirming no other consumer; the Firebase project must stay alive while old `imageUrl`s point at it; a backfill (copy objects → rewrite `Events.imageUrl`) is the deferred follow-up that would allow decommissioning Firebase entirely.

## Test plan

- Manual (requires dev env with Supabase env vars): create/edit an event → upload a flyer → image previews and persists; remove it; save an event with an OLD Firebase-hosted image untouched → still renders.
- No good unit seam exists for the upload component (it's a thin client wrapper over the SDK); don't force one. If plan 014's jest patterns exist, a unit test for `deleteEventFlyer`'s foreign-URL no-op is worthwhile (pure URL parsing).

## Done criteria

- [ ] `grep -rni "firebase" apps/web/src` → 0 matches; `firebase` absent from `apps/web/package.json`
- [ ] Bucket migration file exists with public-read/auth-write policies
- [ ] `EventImageUpload` props contract unchanged (diff shows internal changes only)
- [ ] `yarn typecheck`, `yarn workspace web test`, `yarn workspace web lint` — all exit 0 / no new errors
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `apps/web/src/lib/supabase/` doesn't expose a browser client factory you can reuse (the auth cutover's structure differs from expectations) — report its actual shape.
- Anything besides `EventImageUpload.tsx` turns out to import `@/config` or `firebase/*` (grep first; the planning-time count was exactly the three files listed).
- You cannot determine the Supabase storage host for Step 5 from the repo/env.

## Maintenance notes

- **Deferred backfill**: copy existing objects from Firebase Storage to the `event-flyers` bucket and rewrite `Events.imageUrl`; only then can the Firebase project be deleted. Until then both hosts serve images.
- Reviewer: scrutinize the storage policies — `authenticated` covers any logged-in user, which matches current behavior (any organizer can upload); per-organizer object ownership would need path-based policies and is intentionally not included.
- Plan 009's `.env.example` must lose the Firebase block when this lands.
