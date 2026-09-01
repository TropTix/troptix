'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { PayoutOrganization } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { LocalTime } from '@/components/LocalTime';
import {
  setPayoutPolicy,
  setPayoutSetupStep,
} from '../_actions/platformPayoutActions';

export function PayoutSetupPanel({
  organizations,
}: {
  organizations: PayoutOrganization[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payout setup</CardTitle>
        <CardDescription>
          Check steps off as they happen with each organization. The payout
          timeline can be customized per organization.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {organizations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No organizations selling paid tickets yet.
          </p>
        ) : (
          <ul className="divide-y">
            {organizations.map((org) => (
              <OrganizationRow key={org.id} org={org} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OrganizationRow({ org }: { org: PayoutOrganization }) {
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleStep = (step: 'meeting' | 'bank', done: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setPayoutSetupStep({
        organizationId: org.id,
        step,
        done,
      });
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {org.displayName}{' '}
            {org.hasCustomPolicy && (
              <Badge variant="outline" className="ml-1">
                Custom timeline
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{org.ownerEmail}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditingPolicy(!editingPolicy)}
        >
          {editingPolicy ? 'Close' : 'Edit timeline'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-6">
        <SetupToggle
          label="Payout meeting held"
          checkedAt={org.payoutMeetingAt}
          disabled={isPending}
          onToggle={(done) => toggleStep('meeting', done)}
        />
        <SetupToggle
          label="Bank linked"
          checkedAt={org.payoutBankLinkedAt}
          disabled={isPending}
          onToggle={(done) => toggleStep('bank', done)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {org.policy.releaseAtSale
          ? `Releases as tickets sell · ${org.policy.holdbackPercent}% held until ${org.policy.holdbackDays} days after event end`
          : `Releases at event end · ${org.policy.holdbackPercent}% held for ${org.policy.holdbackDays} days`}
      </p>

      {editingPolicy && (
        <PolicyEditor org={org} onDone={() => setEditingPolicy(false)} />
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

function SetupToggle({
  label,
  checkedAt,
  disabled,
  onToggle,
}: {
  label: string;
  checkedAt: string | null;
  disabled: boolean;
  onToggle: (done: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checkedAt !== null}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
      <div>
        <p className="text-sm">{label}</p>
        {checkedAt && (
          <p className="text-xs text-muted-foreground">
            <LocalTime at={checkedAt} />
          </p>
        )}
      </div>
    </div>
  );
}

// Inputs hold the raw overrides — an empty field means "platform default"
// and saves as null, so a defaults org never gets pinned to today's numbers.
const overrideField = (max: number) =>
  z
    .string()
    .trim()
    .refine((raw) => {
      if (raw === '') return true;
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value <= max;
    }, `Whole number from 0 to ${max}, or blank for the platform default.`);

const policySchema = z.object({
  releaseAtSale: z.boolean(),
  percent: overrideField(100),
  days: overrideField(365),
});

type PolicyValues = z.infer<typeof policySchema>;

function PolicyEditor({
  org,
  onDone,
}: {
  org: PayoutOrganization;
  onDone: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<PolicyValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      releaseAtSale: org.policy.releaseAtSale,
      percent:
        org.holdbackPercentOverride === null
          ? ''
          : String(org.holdbackPercentOverride),
      days:
        org.holdbackDaysOverride === null
          ? ''
          : String(org.holdbackDaysOverride),
    },
  });

  const submit = (values: PolicyValues) => {
    setServerError(null);
    startTransition(async () => {
      const result = await setPayoutPolicy({
        organizationId: org.id,
        releaseAtSale: values.releaseAtSale,
        holdbackPercent:
          values.percent === '' ? null : Number.parseInt(values.percent, 10),
        holdbackDays:
          values.days === '' ? null : Number.parseInt(values.days, 10),
      });
      if (result.success) {
        onDone();
      } else {
        setServerError(result.error ?? 'Something went wrong.');
      }
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(submit)}
        className="space-y-3 rounded-lg bg-muted/40 p-4"
      >
        <FormField
          control={form.control}
          name="releaseAtSale"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div>
                <FormLabel className="text-sm font-normal">
                  Release earnings as tickets sell
                </FormLabel>
                <p className="text-xs text-muted-foreground">
                  Lets this organizer withdraw before the event ends; the
                  holdback still anchors to event end.
                </p>
              </div>
            </FormItem>
          )}
        />
        <div className="flex flex-wrap items-start gap-3">
          <FormField
            control={form.control}
            name="percent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Holdback %</FormLabel>
                <FormControl>
                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="default"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Holdback days</FormLabel>
                <FormControl>
                  <Input
                    className="w-28"
                    type="number"
                    min={0}
                    max={365}
                    placeholder="default"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="sm" className="mt-6" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save timeline'}
          </Button>
        </div>
        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}
      </form>
    </Form>
  );
}
