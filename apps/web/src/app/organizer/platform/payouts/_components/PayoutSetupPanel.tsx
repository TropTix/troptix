'use client';

import { useState, useTransition } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function PolicyEditor({
  org,
  onDone,
}: {
  org: PayoutOrganization;
  onDone: () => void;
}) {
  // Inputs hold the raw overrides — an empty field means "platform default"
  // and saves as null, so a defaults org never gets pinned to today's numbers.
  const [releaseAtSale, setReleaseAtSale] = useState(org.policy.releaseAtSale);
  const [percent, setPercent] = useState(
    org.holdbackPercentOverride === null
      ? ''
      : String(org.holdbackPercentOverride)
  );
  const [days, setDays] = useState(
    org.holdbackDaysOverride === null ? '' : String(org.holdbackDaysOverride)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parseOverride = (raw: string, max: number): number | null | false => {
    if (raw.trim() === '') return null;
    const value = Number.parseInt(raw, 10);
    return Number.isInteger(value) && value >= 0 && value <= max
      ? value
      : false;
  };

  const submit = () => {
    const holdbackPercent = parseOverride(percent, 100);
    const holdbackDays = parseOverride(days, 365);
    if (holdbackPercent === false || holdbackDays === false) {
      setError('Holdback must be 0–100% and 0–365 days, or blank for default.');
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await setPayoutPolicy({
        organizationId: org.id,
        releaseAtSale,
        holdbackPercent,
        holdbackDays,
      });
      if (result.success) {
        onDone();
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Switch checked={releaseAtSale} onCheckedChange={setReleaseAtSale} />
        <div>
          <p className="text-sm">Release earnings as tickets sell</p>
          <p className="text-xs text-muted-foreground">
            Lets this organizer withdraw before the event ends; the holdback
            still anchors to event end.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`pct-${org.id}`}>Holdback %</Label>
          <Input
            id={`pct-${org.id}`}
            className="w-28"
            type="number"
            min={0}
            max={100}
            placeholder="default"
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`days-${org.id}`}>Holdback days</Label>
          <Input
            id={`days-${org.id}`}
            className="w-28"
            type="number"
            min={0}
            max={365}
            placeholder="default"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
        <Button size="sm" disabled={isPending} onClick={submit}>
          {isPending ? 'Saving…' : 'Save timeline'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
