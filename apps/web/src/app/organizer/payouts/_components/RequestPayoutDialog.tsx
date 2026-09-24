'use client';

import { useState, useTransition, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCents } from '@/lib/dateUtils';
import { requestPayout } from '../_actions/payoutActions';

const formSchema = (availableCents: number) =>
  z.object({
    amount: z.coerce
      .number({ invalid_type_error: 'Enter an amount.' })
      .positive('Enter an amount above $0.')
      .refine(
        (dollars) => Math.round(dollars * 100) <= availableCents,
        'The amount is more than your available balance.'
      ),
    note: z.string().trim().max(500).optional(),
  });

type FormValues = z.infer<ReturnType<typeof formSchema>>;

export function RequestPayoutDialog({
  availableCents,
  disabled = false,
  size,
}: {
  availableCents: number;
  disabled?: boolean;
} & Pick<ComponentProps<typeof Button>, 'size'>) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const maxDollars = (availableCents / 100).toFixed(2);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(availableCents)),
    defaultValues: { amount: availableCents / 100, note: '' },
  });

  const amount = form.watch('amount');
  const amountCents = Math.round(Number(amount || 0) * 100);

  const onOpenChange = (next: boolean) => {
    if (next) {
      form.reset({ amount: availableCents / 100, note: '' });
      setServerError(null);
    }
    setOpen(next);
  };

  const submit = (values: FormValues) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPayout({
        amountCents: Math.round(values.amount * 100),
        note: values.note || undefined,
      });
      if (result.success) {
        setOpen(false);
      } else {
        setServerError(result.error ?? 'Something went wrong.');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size={size} disabled={disabled}>
          Request payout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a payout</DialogTitle>
          <DialogDescription>
            You can have one open request at a time. Cancel it any time before
            it&apos;s paid.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Amount (up to {formatCents(availableCents)})
                  </FormLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                      $
                    </span>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        max={maxDollars}
                        className="px-7 pr-14"
                        {...field}
                      />
                    </FormControl>
                    <button
                      type="button"
                      onClick={() =>
                        form.setValue('amount', availableCents / 100, {
                          shouldValidate: true,
                        })
                      }
                      className="absolute inset-y-0 right-3 text-[13px] font-medium text-primary hover:underline"
                    >
                      Max
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Anything the TropTix team should know"
                      maxLength={500}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isPending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Requesting…'
                  : `Request ${formatCents(amountCents)}`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
