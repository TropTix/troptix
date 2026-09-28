'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, Wallet } from 'lucide-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FeatureFlag } from '@troptix/api';

import { Button } from '@/components/ui/button';

const BOOKING_URL =
  'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2WEgtuwexAzT6QOpQIiwK2PhMfJcPzu8E8T2zbXUAeU79qA_9KJiWbSIb9ddCgFD78gLrx9F0R';

export function PaidTicketingBanner() {
  // Only `=== true` is on — undefined means the flags haven't loaded yet.
  const payoutsEnabled = useFeatureFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS);

  if (payoutsEnabled === true) {
    return (
      <Callout
        icon={<Wallet className="size-5" />}
        title="Finish payout setup to sell paid tickets"
        body="Free tickets are on now. Paid tickets turn on once payout setup is done."
        steps={['Meet with TropTix', 'Connect your bank account']}
        actions={
          <Button asChild>
            <Link href="/organizer/payouts">
              Set up payouts
              <ArrowRight />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <Callout
      icon={<CalendarClock className="size-5" />}
      title="Want to sell paid tickets?"
      body="Free events are open to you now. To sell paid tickets, schedule a short call with the TropTix team."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link
              href="mailto:info@usetroptix.com?subject=Organizer Verification Request"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contact support
            </Link>
          </Button>
          <Button asChild>
            <Link href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
              Schedule a call
            </Link>
          </Button>
        </>
      }
    />
  );
}

function Callout({
  icon,
  title,
  body,
  steps,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  steps?: string[];
  actions: React.ReactNode;
}) {
  return (
    <div className="@container">
      <section
        aria-label={title}
        className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-card p-5 shadow-sm @xl:flex-row @xl:items-center @xl:gap-5"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-semibold leading-tight">{title}</p>
            <p className="text-sm text-muted-foreground">{body}</p>
            {steps && (
              <ol className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-sm">
                {steps.map((step, index) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-14 @xl:shrink-0 @xl:justify-end @xl:pl-0">
          {actions}
        </div>
      </section>
    </div>
  );
}
