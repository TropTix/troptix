/**
 * Seed a ready-to-buy event for testing the `/e/[eventId]` checkout flow.
 *
 * Usage:
 *   yarn workspace web db:seed
 *
 * Creates one published event with a paid tier (GA) and a free tier (RSVP),
 * both public and on-sale now, then prints the `/e/<id>` URL. Runs against the
 * DB in `apps/web/.env` (POSTGRES_PRISMA_URL) — point that at a dev/preview
 * branch, never prod.
 *
 * The tier fields matter for the reservation flow specifically:
 *  - `capacity` MUST be set (not just `quantity`): the hold SQL reads the raw
 *    `capacity` column, and Postgres GREATEST ignores NULL, so a NULL capacity
 *    reserves as sold-out.
 *  - a sale window open now (`saleStartDate`/`saleEndDate` + the atomic
 *    `saleStartsAt`/`saleEndsAt`) and `isDraft: false`, or the tier isn't buyable.
 */
import prisma from '@troptix/db';

const SEED_ORGANIZER_USER_ID = 'seed-script-organizer';

async function main() {
  const now = Date.now();
  const day = 86_400_000;
  const startDate = new Date(now + 30 * day);
  const endDate = new Date(now + 30 * day + 3 * 60 * 60 * 1000);
  const saleStart = new Date(now - day); // opened yesterday
  const saleEnd = new Date(now + 30 * day); // closes at event start

  const event = await prisma.events.create({
    data: {
      isDraft: false,
      name: `Seed Test Event ${new Date(now).toISOString().slice(0, 16)}`,
      description:
        'Auto-generated fixture for testing the /e/[eventId] checkout flow.',
      organizer: 'TropTix Seed',
      organizerUserId: SEED_ORGANIZER_USER_ID,
      startDate,
      endDate,
      startsAt: startDate,
      endsAt: endDate,
      venue: 'Test Venue',
      address: '123 Test St, Kingston, Jamaica',
      ticketTypes: {
        create: [
          {
            name: 'General Admission',
            description: 'Paid tier — exercises the Stripe checkout.',
            ticketType: 'PAID',
            maxPurchasePerUser: 10,
            quantity: 100,
            capacity: 100,
            reserved: 0,
            sold: 0,
            price: 25,
            priceCents: 2500,
            ticketingFees: 'PASS_TICKET_FEES',
            saleStartDate: saleStart,
            saleEndDate: saleEnd,
            saleStartsAt: saleStart,
            saleEndsAt: saleEnd,
          },
          {
            name: 'Free RSVP',
            description: 'Free tier — exercises the RSVP path.',
            ticketType: 'FREE',
            maxPurchasePerUser: 4,
            quantity: 50,
            capacity: 50,
            reserved: 0,
            sold: 0,
            price: 0,
            priceCents: 0,
            ticketingFees: 'ABSORB_TICKET_FEES',
            saleStartDate: saleStart,
            saleEndDate: saleEnd,
            saleStartsAt: saleStart,
            saleEndsAt: saleEnd,
          },
        ],
      },
    },
    select: { id: true, name: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log(`\n✓ Seeded event: ${event.name}`);
  console.log(`  ${baseUrl}/e/${event.id}\n`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
