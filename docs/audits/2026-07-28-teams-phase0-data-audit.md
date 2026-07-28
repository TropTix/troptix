# Teams Phase 0 — data audit

Point-in-time audit, 2026-07-28. Read-only queries against the production
database and the persistent dev branch, run before merging the Phase 0
migrations (`20260728100000` – `20260728100200`) to confirm what the
backfill and dedupe steps would actually do. Frozen on write.

## What was checked

| Check                                                                                                | Prod | Dev branch |
| ---------------------------------------------------------------------------------------------------- | ---- | ---------- |
| Organizations sharing an `ownerUserId` (dedupe target)                                               | 0    | 0          |
| Events with NULL `organizationId` (backfill target)                                                  | 0    | 0          |
| Organizers with events but no Organization                                                           | 0    | 0          |
| NULL-org events whose organizer has no `Users` row (the one condition that could fail the migration) | 0    | 0          |
| Dual-write violations (`organizerUserId` ≠ `organization.ownerUserId`)                               | 0    | 0          |
| Case-colliding emails (`lower(email)` duplicates)                                                    | 0    | 0          |
| `@usetroptix.com` users the platform-owner grant seeds                                               | 4    | 4          |

## Conclusions

- Both databases already satisfy every invariant Phase 0 locks in. The
  June backfill script did its job in production (or all rows post-date
  the dual-write).
- The in-migration backfill and dedupe are therefore no-ops on live
  data. They stay in the migration anyway: preview branches replay all
  migrations from empty, and the backfill is what makes the
  `SET NOT NULL` step unable to fail on any target.
- The unique index, the NOT NULL, and the `ON DELETE RESTRICT` flip
  apply cleanly with no data repair.
- Grant seeding will mark exactly the four staff accounts.

## Incidental finding (for Phase 2)

A large share of `Users` rows have no `authUserId` — Firebase-era
accounts that have never signed in since the Supabase cutover. Inviting
one of these emails must go through the provisioning trigger's
link-by-email path (case-insensitive UPDATE on first sign-in), not the
fresh-signup path. Add a test for that case when invites land.
