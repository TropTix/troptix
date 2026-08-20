import { Globe } from 'lucide-react';
import {
  InstagramIcon as Instagram,
  LinkedinIcon as Linkedin,
  TwitterIcon as Twitter,
} from '@/components/icons/brand';
import { cn } from '@/lib/utils';

// Organization social links, shared by the org page and the event "Hosted by".
// instagram/twitter are stored as usernames (URL built here); linkedin/website
// are full URLs (a scheme is prepended if missing).

export type OrgSocials = {
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
  website: string | null;
};

const withScheme = (url: string) =>
  /^https?:\/\//i.test(url) ? url : `https://${url}`;
const handle = (username: string) => username.replace(/^@+/, '').trim();

type SocialLink = {
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  label: string;
};

function build(socials: OrgSocials) {
  const links: SocialLink[] = [];
  if (socials.instagram && handle(socials.instagram)) {
    links.push({
      icon: Instagram,
      href: `https://instagram.com/${handle(socials.instagram)}`,
      label: 'Instagram',
    });
  }
  if (socials.twitter && handle(socials.twitter)) {
    links.push({
      icon: Twitter,
      href: `https://x.com/${handle(socials.twitter)}`,
      label: 'Twitter',
    });
  }
  if (socials.linkedin) {
    links.push({
      icon: Linkedin,
      href: withScheme(socials.linkedin),
      label: 'LinkedIn',
    });
  }
  if (socials.website) {
    links.push({
      icon: Globe,
      href: withScheme(socials.website),
      label: 'Website',
    });
  }
  return links;
}

export function OrgSocialLinks({
  socials,
  className,
  size = 'md',
}: {
  socials: OrgSocials;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const links = build(socials);
  if (links.length === 0) return null;
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {links.map(({ icon: Icon, href, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={cn(
            'grid place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            dim
          )}
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}
