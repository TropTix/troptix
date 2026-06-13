// @troptix/api — TYPE-ONLY BARREL (default entry).
//
// RN-safe. This entry exposes only the things every client may import without
// pulling server runtime: the `AppRouter` *type* (`import type`) and zod
// contract schemas/types. It must never re-export the router value, the
// service layer, or anything that transitively imports @troptix/db.
//
// Exposes the zod contracts (runtime — zod is RN-safe) and the `AppRouter`
// *type* (erased — `export type`, so the router value + @trpc/server + DB
// runtime are NOT pulled into a client/RN bundle). That's the whole RN-safety
// mechanism: clients import the router's type for their tRPC client, never the
// value.
export * from './contracts';
export type { AppRouter } from './trpc/routers';
