'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import type { EventStatus, OrganizerEventSummary } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { getDateFormatter } from '@/lib/dateUtils';
import { DEFAULT_EVENT_IMAGE, eventFlyerUrl } from '@/lib/supabase/storage';

// 'All' is the chip; the rest mirror EventStatus. Kept in view order.
type Filter = 'All' | EventStatus;
const FILTERS: Filter[] = ['All', 'Active', 'Upcoming', 'Past', 'Draft'];

const STATUS_VARIANT: Record<EventStatus, 'default' | 'outline' | 'secondary'> =
  {
    Active: 'default',
    Upcoming: 'outline',
    Past: 'secondary',
    Draft: 'secondary',
  };

export function EventsList({ events }: { events: OrganizerEventSummary[] }) {
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (event) =>
        (filter === 'All' || event.status === filter) &&
        (q === '' || event.name.toLowerCase().includes(q))
    );
  }, [events, filter, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events"
            className="pl-8"
            aria-label="Search events by name"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No events match.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: OrganizerEventSummary }) {
  const soldPercent =
    event.capacity > 0 ? (event.sold / event.capacity) * 100 : 0;
  const flyerUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  return (
    <Link href={`/organizer/events/${event.id}`} className="group">
      <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-primary/50">
        <div className="relative aspect-video w-full shrink-0 bg-muted">
          <Image
            src={flyerUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight" title={event.name}>
              {event.name}
            </h3>
            <Badge variant={STATUS_VARIANT[event.status]} className="shrink-0">
              {event.status}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            {getDateFormatter(new Date(event.startsAt), 'MMM d, yyyy')}
          </p>

          <div className="mt-auto space-y-1 pt-1">
            <Progress value={soldPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {event.sold.toLocaleString()} / {event.capacity.toLocaleString()}{' '}
              sold
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
