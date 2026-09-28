'use client';

import { useState, type ComponentProps } from 'react';
import Image from 'next/image';
import { ArrowRight, Clock, FileText, Landmark, Lock } from 'lucide-react';
import { PAYOUT_COUNTRIES } from '@troptix/api';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { startGlobalPayoutsOnboarding } from '../_actions/payoutActions';
import { StripeActionButton } from './StripeActionButton';

type Country = 'us' | 'other';
type EntityType = 'individual' | 'company';

/**
 * The country choice is never stored: "United States" hands off to Stripe
 * Connect; another country hands off to Stripe Global Payouts with the
 * country and entity type in the create call (ADR 0034). With the Global
 * Payouts flag off, anything but the US only reveals the manual-rail copy.
 */
export function ConnectBankDialog({
  size = 'sm',
  globalPayouts = false,
}: Pick<ComponentProps<typeof Button>, 'size'> & { globalPayouts?: boolean }) {
  const [country, setCountry] = useState<Country | null>(null);
  const [code, setCode] = useState<string>('JM');
  const [entityType, setEntityType] = useState<EntityType>('individual');

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
            <RadioCard
              name="bank-country"
              value="us"
              selected={country === 'us'}
              onSelect={() => setCountry('us')}
              title="United States"
              description="Set up through Stripe in about five minutes."
            />
            <RadioCard
              name="bank-country"
              value="other"
              selected={country === 'other'}
              onSelect={() => setCountry('other')}
              title={globalPayouts ? 'Another country' : 'Jamaica or elsewhere'}
              description={
                globalPayouts
                  ? 'Paid in your local currency through Stripe.'
                  : 'We set this up together.'
              }
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

        {country === 'other' && !globalPayouts && (
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

        {country === 'other' && globalPayouts && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="bank-country-code">Country of the bank</Label>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger id="bank-country-code" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYOUT_COUNTRIES.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.name} — paid in {option.currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Don&apos;t see your country? We set this up together during your
                payout meeting.
              </p>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Who holds the account?
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <RadioCard
                  name="bank-entity"
                  value="individual"
                  selected={entityType === 'individual'}
                  onSelect={() => setEntityType('individual')}
                  title="Myself"
                  description="A personal bank account."
                />
                <RadioCard
                  name="bank-entity"
                  value="company"
                  selected={entityType === 'company'}
                  onSelect={() => setEntityType('company')}
                  title="A registered business"
                  description="A business bank account."
                />
              </div>
            </fieldset>
            <ul className="space-y-3.5">
              <ReadyItem icon={<Lock />} title="Encrypted end to end">
                Stripe is certified to the highest level of payment security
                (PCI Level 1).
              </ReadyItem>
              <ReadyItem icon={<FileText />} title="Have these ready">
                Your name as the bank knows it and the account details from your
                bank.
              </ReadyItem>
              <ReadyItem icon={<Clock />} title="About 5 minutes">
                Payouts are converted to your currency at Stripe&apos;s rate and
                land within about a week.
              </ReadyItem>
            </ul>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <StripeActionButton
                run={() =>
                  startGlobalPayoutsOnboarding({ country: code, entityType })
                }
              >
                Continue with Stripe
              </StripeActionButton>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RadioCard({
  name,
  value,
  selected,
  onSelect,
  title,
  description,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-input hover:bg-accent'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
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
    </label>
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
