import { Globe, Instagram, Linkedin, Twitter } from 'lucide-react';
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

function build(socials: OrgSocials) {
  return [
    socials.instagram &&
      handle(socials.instagram) && {
        icon: Instagram,
        href: `https://instagram.com/${handle(socials.instagram)}`,
        label: 'Instagram',
      },
    socials.twitter &&
      handle(socials.twitter) && {
        icon: Twitter,
        href: `https://x.com/${handle(socials.twitter)}`,
        label: 'Twitter',
      },
    socials.linkedin && {
      icon: Linkedin,
      href: withScheme(socials.linkedin),
      label: 'LinkedIn',
    },
    socials.website && {
      icon: Globe,
      href: withScheme(socials.website),
      label: 'Website',
    },
  ].filter(Boolean) as { icon: typeof Globe; href: string; label: string }[];
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
