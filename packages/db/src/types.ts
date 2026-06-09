// @troptix/db/types — RN-SAFE TYPES ENTRY.
//
// Zero runtime: re-exports only the *type* surface of the generated Prisma
// client (model types, enum types, the `Prisma` namespace types). `export
// type *` erases at compile time, so `import type { ... } from
// '@troptix/db/types'` never drags the client or `pg` into a client/RN bundle.
//
// Enum *values* (runtime const objects) are intentionally NOT here — server
// code imports those from `@troptix/db`. A dedicated RN-safe enum-values entry
// can be added when the Expo app needs them (Stage 3).
export type * from './generated/prisma/client';
