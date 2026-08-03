'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Settings,
  Ticket,
  Users,
  ClipboardList,
  LayoutDashboard,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export function EventManagementNav({
  eventId,
  eventName,
  isDraft,
}: {
  eventId: string;
  eventName: string;
  isDraft: boolean;
}) {
  const pathname = usePathname();
  // View-as rides the query string (ADR 0018); every tab must carry it or a
  // Platform Owner's session re-scopes to themselves one click in.
  const viewAs = useSearchParams().get('viewAs');
  const withScope = (href: string) =>
    viewAs ? `${href}?viewAs=${encodeURIComponent(viewAs)}` : href;
  const router = useRouter();
  const [isPublished, setIsPublished] = useState(!isDraft);
  const [isLoading, setIsLoading] = useState(false);

  const handleTogglePublish = async (checked: boolean) => {
    setIsLoading(true);
    setIsPublished(checked);

    try {
      const response = await fetch(`/api/events/${eventId}/toggle-publish`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (!response.ok) {
        setIsPublished(!checked);

        if (response.status === 400 && data.validationErrors) {
          const requirements = data.missingRequirements || [];
          const errorMessage =
            requirements.length > 0
              ? `Missing requirements: ${requirements.slice(0, 3).join(', ')}${requirements.length > 3 ? '...' : ''}`
              : data.error || 'Event cannot be published yet';

          toast.error(errorMessage, {
            duration: 3000,
            description:
              data.summary ||
              `Please complete all required fields before publishing.`,
          });
          router.push(`/organizer/events/${eventId}/edit`);
        } else {
          throw new Error(data.error || 'Failed to update event status');
        }
        return;
      }

      setIsPublished(!data.isDraft);
      toast.success(
        data.isDraft ? 'Event unpublished' : 'Event published successfully'
      );
    } catch (error) {
      setIsPublished(!checked);
      toast.error(
        error instanceof Error ? error.message : 'Failed to update event status'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const links = [
    {
      name: 'Dashboard',
      href: `/organizer/events/${eventId}`,
      icon: LayoutDashboard,
    },
    {
      name: 'Edit',
      href: `/organizer/events/${eventId}/edit`,
      icon: Pencil,
    },
    {
      name: 'Tickets',
      href: `/organizer/events/${eventId}/tickets`,
      icon: Ticket,
    },
    {
      name: 'Attendees',
      href: `/organizer/events/${eventId}/attendees`,
      icon: Users,
    },
    {
      name: 'Orders',
      href: `/organizer/events/${eventId}/orders`,
      icon: ClipboardList,
    },
  ].map((link) => ({ ...link, href: withScope(link.href) }));

  return (
    <div className="border-b bg-card rounded-xl sticky top-0 z-10">
      <div className="container flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/organizer/events"
            className="p-2 rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <p className="text-sm text-muted-foreground">Event</p>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{eventName}</h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-24 text-right">
              {isPublished ? 'Published' : 'Unpublished'}
            </span>
            <Switch
              checked={isPublished}
              onCheckedChange={handleTogglePublish}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>
      <div className="container">
        <nav className="-mb-px flex gap-8 overflow-x-auto" aria-label="Tabs">
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className={cn(
                'whitespace-nowrap flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-primary/30 hover:text-primary'
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
