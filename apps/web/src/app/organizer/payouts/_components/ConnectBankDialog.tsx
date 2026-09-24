'use client';

import { useState, type ComponentProps } from 'react';
import Image from 'next/image';
import { ArrowRight, Clock, FileText, Landmark, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { StripeActionButton } from './StripeActionButton';

type Country = 'us' | 'other';

/**
 * The country choice is never stored: "United States" hands off to Stripe,
 * anything else only reveals the manual-rail copy (plan decision 6).
 */
export function ConnectBankDialog({
  size = 'sm',
}: Pick<ComponentProps<typeof Button>, 'size'>) {
  const [country, setCountry] = useState<Country | null>(null);

  return (
    <Dialog onOpenChange={(open) => !open && setCountry(null)}>
      <DialogTrigger asChild>
        <Button size={size}>Connect bank</Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Landmark className="size-5" />
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
          <Image
            src="/logos/stripe.png"
            alt="Stripe"
            width={40}
            height={40}
            className="size-10 rounded-lg object-contain"
          />
        </div>
        <DialogHeader>
          <DialogTitle>Connect your bank account</DialogTitle>
          <DialogDescription>
            TropTix sends payouts through Stripe. Your bank details stay with
            Stripe — TropTix never sees or stores your account number.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Where is the bank account you want paid?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <CountryOption
              selected={country === 'us'}
              onSelect={() => setCountry('us')}
              title="United States"
              description="Set up through Stripe in about five minutes."
            />
            <CountryOption
              selected={country === 'other'}
              onSelect={() => setCountry('other')}
              title="Jamaica or elsewhere"
              description="We set this up together."
            />
          </div>
        </fieldset>

        {country === 'us' && (
          <>
            <ul className="space-y-3.5">
              <ReadyItem icon={<Lock />} title="Encrypted end to end">
                Stripe is certified to the highest level of payment security
                (PCI Level 1).
              </ReadyItem>
              <ReadyItem icon={<FileText />} title="Have these ready">
                A U.S. address, an SSN or EIN, and a U.S. bank account. Already
                use Stripe? Sign in on the next screen and reuse your details.
              </ReadyItem>
              <ReadyItem icon={<Clock />} title="About 5 minutes">
                You&apos;ll come back to this page when you&apos;re done.
              </ReadyItem>
            </ul>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <StripeActionButton action="onboarding">
                Continue with Stripe
              </StripeActionButton>
            </DialogFooter>
          </>
        )}

        {country === 'other' && (
          <>
            <p className="text-sm text-muted-foreground">
              We set this up together during your payout meeting. Your bank
              details are held at our bank — TropTix never stores them.
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CountryOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input hover:bg-accent'
      )}
    >
      <span
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded-full border',
          selected ? 'border-[5px] border-primary' : 'border-muted-foreground'
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function ReadyItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&>svg]:size-4">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
