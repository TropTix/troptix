import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { spotlightImageUrl } from '@/lib/supabase/storage';
import type { SpotlightItem } from '@troptix/api';

// The per-event "Spotlight" strip: curated cards for DJs, artists, speakers, or
// sponsors. Each card is image + title + optional blurb, and links out (to IG,
// LinkedIn, a bio page, …) when a link is set. See docs/plans/2026-06-event-
// spotlight-and-organizer-brand.md.

/** Prepend https:// when the stored link omits a scheme (organizers paste bare
 * handles/domains like `instagram.com/djkala`). */
function externalHref(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const chars = words.slice(0, 2).map((w) => w[0] ?? '');
  return chars.join('').toUpperCase() || '?';
}

function SpotlightCardBody({ item }: { item: SpotlightItem }) {
  const src = spotlightImageUrl(item.imageUrl);
  return (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
        {src ? (
          <Image
            src={src}
            alt={item.title}
            fill
            sizes="(min-width: 640px) 200px, 40vw"
            className="object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-2xl font-bold text-muted-foreground">
            {initials(item.title)}
          </span>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <p className="flex items-center gap-1 font-semibold">
          <span className="truncate">{item.title}</span>
          {item.link && (
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </p>
        {item.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
    </>
  );
}

export default function SpotlightSection({
  spotlight,
}: {
  spotlight: SpotlightItem[];
}) {
  if (spotlight.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Spotlight
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {spotlight.map((item) => (
          <li key={item.id}>
            {item.link ? (
              <a
                href={externalHref(item.link)}
                target="_blank"
                rel="noopener noreferrer"
                className="group block transition-opacity hover:opacity-90"
              >
                <SpotlightCardBody item={item} />
              </a>
            ) : (
              <SpotlightCardBody item={item} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
