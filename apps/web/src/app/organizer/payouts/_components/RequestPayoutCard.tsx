'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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

export function RequestPayoutCard({
  availableCents,
  hasOpenRequest,
  holdbackLine,
}: {
  availableCents: number;
  hasOpenRequest: boolean;
  holdbackLine: string;
}) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema(availableCents)),
    defaultValues: { amount: availableCents / 100, note: '' },
  });

  const disabled = hasOpenRequest || availableCents <= 0;
  const amount = form.watch('amount');
  const amountCents = Math.round(Number(amount || 0) * 100);

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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Request a payout</CardTitle>
          <CardDescription>
            {hasOpenRequest
              ? 'Your open request is being processed — one at a time.'
              : holdbackLine}
          </CardDescription>
        </div>
        {!open && (
          <Button
            disabled={disabled}
            onClick={() => {
              form.reset({ amount: availableCents / 100, note: '' });
              setServerError(null);
              setOpen(true);
            }}
          >
            Request payout
          </Button>
        )}
      </CardHeader>

      {open && (
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="sm:max-w-xs">
                    <FormLabel>
                      Amount (up to {formatCents(availableCents)})
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        max={(availableCents / 100).toFixed(2)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem className="sm:max-w-md">
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
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? 'Requesting…'
                    : `Request ${formatCents(amountCents)}`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => {
                    setOpen(false);
                    setServerError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      )}
    </Card>
  );
}
