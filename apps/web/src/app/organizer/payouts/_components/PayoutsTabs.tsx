import Link from 'next/link';

import { cn } from '@/lib/utils';

export const PAYOUT_TABS = ['overview', 'requests', 'settings'] as const;
export type PayoutTab = (typeof PAYOUT_TABS)[number];

export function parsePayoutTab(value: string | undefined): PayoutTab {
  return PAYOUT_TABS.find((tab) => tab === value) ?? 'overview';
}

const LABELS: Record<PayoutTab, string> = {
  overview: 'Overview',
  requests: 'Requests',
  settings: 'Settings',
};

export function PayoutsTabs({
  active,
  openRequests,
  viewAs,
}: {
  active: PayoutTab;
  openRequests: number;
  viewAs?: string;
}) {
  const href = (tab: PayoutTab) => {
    const params = new URLSearchParams();
    if (tab !== 'overview') params.set('tab', tab);
    if (viewAs) params.set('viewAs', viewAs);
    const query = params.toString();
    return query ? `/organizer/payouts?${query}` : '/organizer/payouts';
  };

  return (
    <nav
      aria-label="Payouts sections"
      className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px]"
    >
      {PAYOUT_TABS.map((tab) => (
        <Link
          key={tab}
          href={href(tab)}
          aria-current={tab === active ? 'page' : undefined}
          className={cn(
            'inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
            tab === active
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {LABELS[tab]}
          {tab === 'requests' && openRequests > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">
              {openRequests}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
