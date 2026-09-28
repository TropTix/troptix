'use client';

import Link from 'next/link';
import { ArrowRight, HelpCircle, Mail } from 'lucide-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FeatureFlag } from '@troptix/api';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

const PAID_CHECKOUT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

const PAYOUT_STEPS = [
  'Meet with TropTix',
  'Connect your bank account',
  'Accept payout terms',
];
const CALL_STEPS = ['Schedule a call', 'Get approved by TropTix'];

export function PaidTicketingBanner() {
  // Only `=== true` is on — undefined means the flags haven't loaded yet.
  const payoutsEnabled = useFeatureFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS);
  const steps = payoutsEnabled === true ? PAYOUT_STEPS : CALL_STEPS;
  return (
    <div className="@container">
      <section
        aria-label="Start selling paid tickets"
        className="relative rounded-xl border bg-card shadow-sm"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Why we meet first"
                className="absolute top-3 right-3 rounded-full p-1 text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-64">
              While TropTix is in beta, we meet with every new customer to make
              sure you get the best experience on the platform.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex flex-col gap-5 p-5 pr-10 @xl:flex-row @xl:items-center @xl:gap-8 @xl:pr-12">
          <div className="min-w-0 @xl:w-56 @xl:shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Paid tickets
            </p>
            <p className="mt-1 font-semibold leading-tight">
              Start selling paid tickets
            </p>
          </div>

          <ol className="flex flex-col gap-3 @xl:flex-1 @xl:flex-row @xl:items-start @xl:gap-0">
            {steps.map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-3 @xl:flex-1 @xl:flex-col @xl:items-start @xl:gap-2"
              >
                <div className="flex items-center @xl:w-full">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary/40 bg-background text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  {index < steps.length - 1 && (
                    <span className="hidden h-0.5 flex-1 bg-primary/20 @xl:block" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{step}</p>
                  <p className="text-xs text-muted-foreground">Not started</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="@xl:shrink-0">
            {payoutsEnabled === true ? (
              <Button asChild>
                <Link href="/organizer/payouts">
                  Set up payouts
                  <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={PAID_CHECKOUT_MAILTO}>
                  <Mail />
                  Contact support
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
