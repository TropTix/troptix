// RN-safe types entry: `export type *` erases at compile time, so this never
// drags the client or `pg` into a client/RN bundle. Keep enum *values* (runtime
// objects) out on purpose — server code imports those from `@troptix/db`.
export type * from './generated/prisma/client';
