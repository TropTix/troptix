import { cache } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { listPublicEvents } from '@troptix/api/server';

import { Button } from '@/components/ui/button';
import prisma from '@/server/prisma';
import EventCard from '@/components/EventCard';

export const revalidate = 86400; // 24 hours in seconds

// Deduped per request, mirroring the /e/[eventId] read pattern.
const loadEvents = cache(() => listPublicEvents(prisma));

export const metadata = {
  title: 'Discover Events',
  description: 'Discover the experiences everyone will talk about tomorrow.',
};

function DiscoverBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(55% 45% at 12% 6%, hsl(var(--primary) / 0.08), transparent 65%)',
            'radial-gradient(60% 55% at 92% 96%, rgba(255, 190, 150, 0.28), transparent 65%)',
            'linear-gradient(180deg, #fbfaf6 0%, #faf8f4 55%, #f4f0e8 100%)',
          ].join(', '),
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
          )}")`,
          backgroundSize: '220px 220px',
        }}
      />
    </div>
  );
}

export default async function DiscoverPage() {
  const events = await loadEvents();

  return (
    <section className="relative isolate min-h-screen overflow-hidden bg-[#faf8f4] text-slate-900">
      <DiscoverBackground />

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <header className="mb-12 sm:mb-16">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Discover
          </h1>
        </header>

        {events.length === 0 ? (
          <div className="mx-auto max-w-md rounded-[26px] bg-white/70 p-10 text-center shadow-[0_20px_50px_-30px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/[0.05] backdrop-blur">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Calendar className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-slate-900">
              No events yet
            </h2>
            <p className="mb-6 text-slate-600">
              There are no upcoming events right now. Check back soon —
              something unforgettable is on the way.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground shadow-[0_10px_28px_-12px_hsl(var(--primary)/0.45)] hover:bg-primary/90"
            >
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
            {events.map((event) => (
              <div key={event.id} className="w-full sm:w-[330px]">
                <EventCard event={event} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
