'use client';

import { motion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import type { EventSummary } from '@troptix/api';

import { getDateFormatter } from '@/lib/dateUtils';
import { DEFAULT_EVENT_IMAGE, eventFlyerUrl } from '@/lib/supabase/storage';

function getRelativeDate(eventDate: Date, now: Date) {
  // Started events fall through to the concrete date — never "In -3 days".
  if (eventDate.toDateString() === now.toDateString()) return 'Today';

  const diffDays = Math.ceil(
    (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  return getDateFormatter(eventDate, 'MMM dd, yyyy');
}

export default function EventCard({ event }: { event: EventSummary }) {
  const eventDate = new Date(event.startDate);
  const now = new Date();

  const displayImageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  return (
    <Link href={`/e/${event.id}`} className="group block">
      <motion.article
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22 }}
        className="relative overflow-hidden rounded-[26px] shadow-[0_30px_70px_-25px_rgba(15,23,42,0.30),0_8px_20px_-8px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/[0.05]"
      >
        <div className="relative aspect-[4/5] w-full">
          <Image
            src={displayImageUrl}
            alt={`${event.name} event flyer`}
            fill
            sizes="(min-width: 640px) 330px, 90vw"
            className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
          />

          {/* Restrained bottom scrim for metadata legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />

          {/* Editorial metadata — floats on the artwork */}
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <h3 className="line-clamp-2 text-[1.4rem] font-semibold leading-[1.1] tracking-tight">
              {event.name}
            </h3>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/70">
              <span className="shrink-0 whitespace-nowrap">
                {getRelativeDate(eventDate, now)}
              </span>
              {event.venue && (
                <>
                  <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-white/40" />
                  <span className="min-w-0 truncate">{event.venue}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </motion.article>
    </Link>
  );
}
