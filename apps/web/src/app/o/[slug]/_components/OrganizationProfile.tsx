import type { ReactNode } from 'react';
import { BadgeCheck, Globe, Instagram, Linkedin, Twitter } from 'lucide-react';
import type { EventSummary, OrganizationDetail } from '@troptix/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';
import EventCard from '@/components/EventCard';

// Public organization page (/o/[slug], surface F5): brand header + the org's
// upcoming/past events. Always public; drafts never reach here (service-side).

const withScheme = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;
const handle = (username: string) => username.replace(/^@+/, '');

function Socials({ org }: { org: OrganizationDetail }) {
  const links = [
    org.instagram && {
      icon: Instagram,
      href: `https://instagram.com/${handle(org.instagram)}`,
      label: 'Instagram',
    },
    org.twitter && {
      icon: Twitter,
      href: `https://x.com/${handle(org.twitter)}`,
      label: 'Twitter',
    },
    org.linkedin && {
      icon: Linkedin,
      href: withScheme(org.linkedin),
      label: 'LinkedIn',
    },
    org.website && {
      icon: Globe,
      href: withScheme(org.website),
      label: 'Website',
    },
  ].filter(Boolean) as { icon: typeof Globe; href: string; label: string }[];

  if (links.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {links.map(({ icon: Icon, href, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function EventGrid({ events }: { events: EventSummary[] }) {
  return (
    <div className="flex flex-wrap gap-6 sm:gap-8">
      {events.map((event) => (
        <div key={event.id} className="w-full sm:w-[330px]">
          <EventCard event={event} />
        </div>
      ))}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-5 border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      {children}
    </section>
  );
}

export default function OrganizationProfile({
  org,
}: {
  org: OrganizationDetail;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:px-6 lg:px-8">
        <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar className="h-24 w-24 rounded-2xl text-2xl">
            <AvatarFallback className="rounded-2xl bg-muted font-semibold text-foreground">
              {initials(org.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight">
                {org.displayName}
              </h1>
              {org.verified && (
                <BadgeCheck
                  className="h-6 w-6 text-primary"
                  aria-label="Verified"
                />
              )}
            </div>
            {org.bio && (
              <p className="mt-2 max-w-2xl text-muted-foreground">{org.bio}</p>
            )}
            <Socials org={org} />
          </div>
        </header>

        <Section label={`Upcoming · ${org.upcomingEvents.length}`}>
          {org.upcomingEvents.length > 0 ? (
            <EventGrid events={org.upcomingEvents} />
          ) : (
            <p className="text-muted-foreground">No upcoming events.</p>
          )}
        </Section>

        {org.pastEvents.length > 0 && (
          <Section label="Past events">
            <EventGrid events={org.pastEvents} />
          </Section>
        )}
      </div>
    </main>
  );
}
