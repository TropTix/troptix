'use client';

import { useState, useTransition, type ComponentProps } from 'react';
import { Check, FileText } from 'lucide-react';
import type { PayoutTerms } from '@troptix/api';

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
import { LocalTime } from '@/components/LocalTime';
import { acceptPayoutTerms } from '../_actions/payoutActions';

/**
 * `canAccept` is false for a read-only view; the service still refuses anyone
 * but the Owner, and the dialog shows that refusal as its error line.
 */
export function PayoutTermsDialog({
  terms,
  accepted,
  acceptedAt,
  canAccept,
  size = 'sm',
  variant = 'outline',
}: {
  terms: PayoutTerms;
  accepted: boolean;
  acceptedAt: string | null;
  canAccept: boolean;
} & Pick<ComponentProps<typeof Button>, 'size' | 'variant'>) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const accept = () =>
    startTransition(async () => {
      setError(null);
      const result = await acceptPayoutTerms({ version: terms.version });
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <Dialog onOpenChange={(open) => !open && setChecked(false)}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          <FileText />
          {accepted ? 'View terms' : 'Review terms'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payout terms</DialogTitle>
          <DialogDescription>
            How your ticket earnings reach you, and what you appoint TropTix to
            do. Version {terms.version}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border bg-muted/40 p-4">
          {terms.sections.map((section) => (
            <section key={section.heading} className="space-y-1">
              <h3 className="text-sm font-semibold">{section.heading}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>
        {accepted ? (
          <DialogFooter className="items-center sm:justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Check className="size-4 text-success" />
              Accepted {acceptedAt && <LocalTime at={acceptedAt} />}
            </span>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        ) : canAccept ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                id="accept-payout-terms"
                type="checkbox"
                className="size-4 accent-primary"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              I&apos;ve read and accept the payout terms
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button onClick={accept} disabled={!checked || isPending}>
                {isPending ? 'Saving…' : 'Accept terms'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <DialogFooter>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
