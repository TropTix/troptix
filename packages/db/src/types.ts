// @troptix/db/types — RN-SAFE TYPES ENTRY.
//
// Zero runtime imports. Everything exported here must be erasable at compile
// time (`export type` only) so `import type { ... } from '@troptix/db/types'`
// disappears in client/RN bundles and never drags server runtime into Metro.
//
// Stage 1 replaces this with inferred Drizzle row/enum types. The placeholder
// below is the Stage 0 canary target for the Expo app's type-only import.
export type PlaceholderRow = {
  readonly __placeholder: true;
};
