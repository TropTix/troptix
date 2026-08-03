import { query, closePool } from './lib/db';
import { deleteEventChain } from './lib/testEvent';

// Every test creates and deletes its own `e2e-` fixture chain, so normally
// there is nothing here to do. This sweep only catches leftovers from runs
// that died before their fixture teardown (killed job, crashed worker) — on
// the shared dev database those would otherwise linger forever. Anything old
// enough cannot belong to a live run.
const STALE = "interval '1 day'";

export default async function globalSetup() {
  try {
    const { rows } = await query(
      `select id from public."Events" where id like 'e2e-event-%' and "createdAt" < now() - ${STALE}`
    );
    for (const row of rows as { id: string }[]) {
      await deleteEventChain(row.id);
    }
    await query(
      `delete from public."Organization" where id like 'e2e-org-%' and "createdAt" < now() - ${STALE}`
    );
    await query(
      `delete from public."Users" where id like 'e2e-user-%' and "createdAt" < now() - ${STALE}`
    );
  } finally {
    await closePool();
  }
}
