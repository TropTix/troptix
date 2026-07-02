'use client';

import { getFormattedCurrency } from '@/lib/utils';
import { getDateFormatter } from '@/lib/dateUtils';
import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, DollarSign, ExternalLink } from 'lucide-react';
import { Event } from '../page';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';

export default function EventCard({ event }: { event: Event }) {
  const displayPrice =
    event.ticketTypes && event.ticketTypes.length > 0
      ? 'From ' + getFormattedCurrency(event.ticketTypes[0].price)
      : 'Free';

  const eventDate = new Date(event.startDate);
  const now = new Date();
  const isToday = eventDate.toDateString() === now.toDateString();

  const displayImageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  const getEventStatus = () => {
    if (isToday) return { label: 'Today', variant: 'destructive' as const };

    const daysUntil = Math.ceil(
      (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntil <= 7)
      return { label: 'This Week', variant: 'default' as const };

    return { label: 'Upcoming', variant: 'outline' as const };
  };

  const getRelativeDate = () => {
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isToday) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays} days`;

    return getDateFormatter(eventDate, 'MMM dd, yyyy');
  };

  const status = getEventStatus();
  const eventUrl = `/e/${event.id}`;

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 cursor-pointer hover:scale-[1.02] overflow-hidden">
      <Link href={eventUrl} className="block">
        <div className="relative aspect-[4/5] overflow-hidden">
          <Image
            src={displayImageUrl}
            alt={`${event.name} event image`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />

          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <Badge
              variant={status.variant}
              className="shadow-sm backdrop-blur-sm"
            >
              {status.label}
            </Badge>
          </div>

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <div className="space-y-2">
              <h3 className="font-bold text-lg leading-tight line-clamp-2 text-white group-hover:text-primary-foreground transition-colors">
                {event.name}
              </h3>

              <div className="space-y-1">
                <div className="flex items-center text-sm text-white/90">
                  <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span className="font-medium">{getRelativeDate()}</span>
                </div>

                {event.venue && (
                  <div className="flex items-center text-sm text-white/90">
                    <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{event.venue}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center text-sm">
                    <DollarSign className="w-4 h-4 mr-1 flex-shrink-0 text-white/90" />
                    <span className="font-semibold text-green-400">
                      {displayPrice}
                    </span>
                  </div>

                  <div className="flex items-center text-sm text-white font-medium group-hover:text-primary-foreground">
                    Get Tickets
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}
