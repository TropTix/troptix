import Link from 'next/link';
import Image from 'next/image';
import { Bricolage_Grotesque } from 'next/font/google';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const displayFont = Bricolage_Grotesque({ subsets: ['latin'] });

export type OrderCardProps = {
  order: {
    id: string;
    orderNumber: string;
    totalLabel: string;
    name: string;
    date: string;
    time: string;
    venue: string;
    imageUrl: string;
    ticketCount: number;
    createdAt: Date;
    eventDate: Date | null;
    isPastEvent: boolean;
    isToday: boolean;
  };
};

export const OrderCard = ({ order }: OrderCardProps) => {
  if (!order) {
    return null;
  }

  const {
    id,
    orderNumber,
    totalLabel,
    name,
    date,
    time,
    venue,
    imageUrl,
    ticketCount,
    isPastEvent,
    isToday,
    eventDate,
  } = order;

  const getEventStatus = () => {
    if (isPastEvent) return null;
    if (isToday) return { label: 'Today', variant: 'default' as const };

    if (eventDate) {
      const daysUntil = Math.ceil(
        (eventDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil <= 7)
        return { label: 'This Week', variant: 'secondary' as const };
    }

    return null;
  };

  const status = getEventStatus();

  const getRelativeDate = () => {
    if (!eventDate) return date;

    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (isPastEvent) return date;
    if (isToday) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays <= 7) return `In ${diffDays} days`;

    return date;
  };

  const meta = isPastEvent
    ? `${date} · ${venue}`
    : `${getRelativeDate()} · ${time} · ${venue}`;

  return (
    <Link
      href={`/orders/${id}/tickets`}
      className="group block overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/6 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28),0_4px_12px_-6px_rgba(15,23,42,0.12)] transition-transform duration-300 hover:-translate-y-1.5"
    >
      <div className="relative aspect-4/5 overflow-hidden">
        <Image
          src={imageUrl}
          alt={`${name} event flyer`}
          fill
          className={cn(
            'object-cover',
            isPastEvent && 'grayscale-[0.7] opacity-90'
          )}
          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
        />
        {status && (
          <div className="absolute top-3 right-3">
            <Badge variant={status.variant} className="shadow-sm">
              {status.label}
            </Badge>
          </div>
        )}
      </div>

      <div className="px-4 pt-3.5">
        <h3
          className={cn(
            'truncate text-[15px] font-bold leading-snug',
            displayFont.className
          )}
        >
          {name}
        </h3>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>

      <div className="mx-4 mt-3 border-t border-dashed" />

      <div className="flex items-center justify-between px-4 pt-2.5 pb-3.5">
        <span className="font-mono text-[13px] font-medium tracking-wider">
          {orderNumber}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'} ·{' '}
          {totalLabel}
          <ArrowRight className="ml-0.5 h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
};
