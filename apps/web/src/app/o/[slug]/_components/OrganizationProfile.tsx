import type { ReactNode } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { EventSummary, OrganizationDetail } from '@troptix/api';
import { OrgAvatar } from '@/components/OrgAvatar';
import { OrgSocialLinks } from '@/components/OrgSocialLinks';
import EventCard from '@/components/EventCard';

// Public organization page (/o/[slug], surface F5): brand header + the org's
// upcoming/past events. Always public; drafts never reach here (service-side).

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
          <OrgAvatar
            name={org.displayName}
            logoUrl={org.logoUrl}
            className="h-24 w-24 rounded-2xl text-2xl"
          />
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
            <OrgSocialLinks socials={org} className="mt-4" />
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
