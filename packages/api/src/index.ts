// @troptix/api — TYPE-ONLY BARREL (default entry).
//
// RN-safe. This entry exposes only the things every client may import without
// pulling server runtime: the `AppRouter` *type* (`import type`) and zod
// contract schemas/types. It must never re-export the router value, the
// service layer, or anything that transitively imports @troptix/db.
//
// Stage 2 adds the zod contracts here (done) and, later, `export type
// { AppRouter }` (PR 2c). The contracts are RN-safe: zod + type-only
// `@troptix/db/types`, no DB runtime.
export * from './contracts';
