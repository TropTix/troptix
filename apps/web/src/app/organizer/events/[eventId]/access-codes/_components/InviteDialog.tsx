'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import {
  INVITE_BATCH_MAX,
  type GrantsView,
  type InviteGuestsResult,
} from '@troptix/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DateTimeField } from '@/components/DateTimeField';
import { inviteGuests } from '../_actions/grantActions';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pasted lists arrive comma-, semicolon-, space- or line-separated. */
function parseEmails(raw: string) {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    valid: parts.filter((p) => EMAIL.test(p)),
    invalid: parts.filter((p) => !EMAIL.test(p)),
  };
}

type Outcome = InviteGuestsResult & { failed: string[]; sent: boolean };

export function InviteDialog({
  eventId,
  ticketTypes,
  open,
  onOpenChange,
}: {
  eventId: string;
  ticketTypes: GrantsView['ticketTypes'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <InviteForm
            eventId={eventId}
            ticketTypes={ticketTypes}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  eventId,
  ticketTypes,
  onDone,
}: {
  eventId: string;
  ticketTypes: GrantsView['ticketTypes'];
  onDone: () => void;
}) {
  const [emails, setEmails] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(ticketTypes.filter((t) => t.hidden).map((t) => t.id))
  );
  const [uses, setUses] = useState('1');
  const [quantity, setQuantity] = useState('1');
  const [expiresAt, setExpiresAt] = useState<Date | undefined>();
  const [send, setSend] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const parsed = parseEmails(emails);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const maxUses = Number(uses);
    const perOrder = Number(quantity);
    if (parsed.valid.length === 0) return setError('Add at least one email.');
    if (parsed.invalid.length > 0) {
      return setError(`Not an email: ${parsed.invalid.slice(0, 3).join(', ')}`);
    }
    if (parsed.valid.length > INVITE_BATCH_MAX) {
      return setError(`Invite up to ${INVITE_BATCH_MAX} people at a time.`);
    }
    if (selected.size === 0) return setError('Pick at least one ticket type.');
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
      return setError('Uses must be a whole number from 1 to 100.');
    }
    if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > 50) {
      return setError('Tickets per order must be a whole number from 1 to 50.');
    }
    if (expiresAt && expiresAt <= new Date()) {
      return setError('The expiry must be in the future.');
    }

    setError(null);
    setSaving(true);
    const result = await inviteGuests(eventId, {
      emails: parsed.valid,
      ticketTypeIds: Array.from(selected),
      maxUses,
      quantity: perOrder,
      expiresAt: expiresAt ?? null,
      send,
    });
    setSaving(false);
    if (!result.success) return setError(result.error);
    setOutcome({ ...result, sent: send });
  }

  if (outcome) {
    const sentCount = outcome.created.length - outcome.failed.length;
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>
            {outcome.created.length === 0
              ? 'No new invitations'
              : `${outcome.created.length} ${
                  outcome.created.length === 1 ? 'invitation' : 'invitations'
                } created`}
          </DialogTitle>
          <DialogDescription>
            {outcome.sent
              ? `${sentCount} sent by email.`
              : 'Not sent. Share each code yourself, or resend from the list.'}
          </DialogDescription>
        </DialogHeader>
        {outcome.failed.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            These didn&apos;t go out; resend them from the list:{' '}
            {outcome.failed.join(', ')}
          </p>
        )}
        {outcome.skipped.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Skipped</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {outcome.skipped.map((s) => (
                <li key={`${s.email}-${s.reason}`}>
                  {s.email} —{' '}
                  {s.reason === 'duplicate'
                    ? 'listed twice'
                    : 'already invited, resend instead'}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>Invite by email</DialogTitle>
        <DialogDescription>
          Each address gets its own code. The email shows the event, the code
          and a link; it carries no message of yours.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="invite-emails">Emails</Label>
        <Textarea
          id="invite-emails"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={5}
          placeholder="One per line, or separated by commas"
        />
        <p className="text-xs text-muted-foreground">
          {parsed.valid.length} of up to {INVITE_BATCH_MAX}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Ticket types</legend>
        <ul className="space-y-1.5">
          {ticketTypes.map((t) => (
            <li key={t.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selected.has(t.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    })
                  }
                />
                {t.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-uses">Uses each</Label>
          <Input
            id="invite-uses"
            inputMode="numeric"
            value={uses}
            onChange={(e) => setUses(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-quantity">Tickets per order</Label>
          <Input
            id="invite-quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Expires</Label>
        <DateTimeField
          value={expiresAt}
          onChange={setExpiresAt}
          disabledBefore={new Date()}
        />
        <p className="text-xs text-muted-foreground">
          Blank never expires. The ticket type&apos;s sale window still applies.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        <span>
          <span className="block font-medium">Send the emails now</span>
          <span className="text-muted-foreground">
            Off creates the codes for you to share yourself.
          </span>
        </span>
        <Switch checked={send} onCheckedChange={setSend} />
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {send ? 'Create and send' : 'Create codes'}
        </Button>
      </DialogFooter>
    </form>
  );
}
