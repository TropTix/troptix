'use client';

import Link from 'next/link';
import { ArrowRight, Wallet } from 'lucide-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FeatureFlag } from '@troptix/api';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const BOOKING_URL =
  'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2WEgtuwexAzT6QOpQIiwK2PhMfJcPzu8E8T2zbXUAeU79qA_9KJiWbSIb9ddCgFD78gLrx9F0R';

export function PaidTicketingBanner() {
  // Only `=== true` is on — undefined means the flags haven't loaded yet.
  const payoutsEnabled = useFeatureFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS);

  if (payoutsEnabled === true) {
    return (
      <Alert variant="info">
        <Wallet />
        <AlertTitle>Finish payout setup to sell paid tickets</AlertTitle>
        <AlertDescription>
          <p>
            Free tickets are on now. Paid tickets turn on once you&apos;ve set
            up payouts with TropTix: a short call, then connecting your bank
            account. Both steps are on the Payouts page.
          </p>
          <Button size="sm" asChild className="mt-1">
            <Link href="/organizer/payouts">
              Set up payouts
              <ArrowRight />
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="info">
      <AlertTitle>Want to sell paid tickets?</AlertTitle>
      <AlertDescription>
        <p>
          Free events are open to you now. To sell paid tickets, schedule a
          short call with the TropTix team.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              href="mailto:info@usetroptix.com?subject=Organizer Verification Request"
              target="_blank"
              rel="noopener noreferrer"
            >
              Contact support
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
              Schedule a call
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
