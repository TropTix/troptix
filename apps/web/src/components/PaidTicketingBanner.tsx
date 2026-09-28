import Link from 'next/link';
import { Mail, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';

const SUPPORT_EMAIL = 'info@usetroptix.com';
const SUBJECT = 'Set up paid checkout';
const BODY = [
  'Hi TropTix,',
  '',
  "I'd like to set up paid checkout for my events.",
  '',
  'Organization: ',
  'First paid event: ',
].join('\n');

export const PAID_CHECKOUT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

export function PaidTicketingBanner() {
  return (
    <div className="@container">
      <section
        aria-label="Start selling paid tickets"
        className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-card p-5 shadow-sm @xl:flex-row @xl:items-center @xl:gap-5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="size-5" />
          </div>
          <p className="font-semibold leading-tight">
            Start selling paid tickets
          </p>
        </div>
        <div className="pl-14 @xl:shrink-0 @xl:pl-0">
          <Button asChild>
            <Link href={PAID_CHECKOUT_MAILTO}>
              <Mail />
              Contact support
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
