// @troptix/api — TYPE-ONLY BARREL (default entry).
//
// RN-safe. This entry exposes only the things every client may import without
// pulling server runtime: the `AppRouter` *type* (`import type`) and zod
// contract schemas/types. It must never re-export the router value, the
// service layer, or anything that transitively imports @troptix/db.
//
// Stage 2 (see docs/plans/2026-06-shared-packages-platform.md) adds the zod
// contracts and `export type { AppRouter }`. Placeholder for Stage 0 wiring.
export type PlaceholderContract = {
  readonly __placeholder: true;
};
