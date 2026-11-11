'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
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
  const tabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = tabsRef.current;
    const tab = nav?.querySelector('[aria-current="page"]');
    if (!nav || !tab) return;
    const navBox = nav.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    nav.scrollLeft +=
      tabBox.left - navBox.left - (navBox.width - tabBox.width) / 2;
  }, [pathname]);

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
  ].map((link) => ({ ...link, path: link.href, href: withScope(link.href) }));

  return (
    <div className="z-10 rounded-xl border-b bg-card sm:sticky sm:top-16">
      <div className="container flex flex-col items-start gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link
            href="/organizer/events"
            aria-label="Back to events"
            className="p-2 rounded-full hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Event</p>
            <h1 className="text-xl font-bold tracking-tight wrap-break-word sm:text-2xl">
              {eventName}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground sm:w-24 sm:text-right">
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
        <nav
          ref={tabsRef}
          aria-label="Tabs"
          className="-mb-px flex gap-6 overflow-x-auto mask-[linear-gradient(to_right,black_calc(100%-2rem),transparent)] sm:gap-8 sm:mask-none"
        >
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              aria-current={pathname === link.path ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors',
                pathname === link.path
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-primary/30 hover:text-primary'
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.name}
            </Link>
          ))}
          {/* With gap-6 this clears the 2rem edge fade, so the last tab can scroll out from under it. */}
          <span aria-hidden className="w-2 shrink-0 sm:hidden" />
        </nav>
      </div>
    </div>
  );
}
