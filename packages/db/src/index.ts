// @troptix/db — SERVER ENTRY.
//
// This entry owns server-only runtime: the Drizzle client, `pg`, and anything
// that must never reach a client/RN bundle. The `server-only` import makes a
// build fail loudly if this module is ever pulled into a client bundle.
//
// Stage 0 is wiring only — the Drizzle schema/client land in Stage 1
// (see docs/plans/2026-06-shared-packages-platform.md). For now this is an
// intentional placeholder so the workspace graph and the server/types split
// resolve.
import 'server-only';

export {};
