/**
 * One-time backfill: give every existing organizer an Organization (brand) and
 * point their events at it via `Events.organizationId`. Idempotent — safe to
 * re-run. See docs/plans/2026-06-event-spotlight-and-organizer-brand.md.
 *
 * Usage:
 *   yarn db:backfill-orgs          # runs against POSTGRES_PRISMA_URL from .env
 *
 * The slug/display-name logic lives in @troptix/api (unit-tested); this is just
 * the runner that supplies the prisma client and reports the result.
 */
import prisma from '@troptix/db';
import { backfillOrganizations } from '@troptix/api/server';

async function main() {
  const { organizationsEnsured, eventsLinked } =
    await backfillOrganizations(prisma);
  console.log(
    `Backfill complete: ${organizationsEnsured} organization(s) ensured, ${eventsLinked} event(s) linked.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
