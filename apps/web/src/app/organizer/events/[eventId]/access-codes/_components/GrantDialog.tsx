'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GrantRow, GrantsView } from '@troptix/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DateTimeField } from '@/components/DateTimeField';
import { createGrant, updateGrant } from '../_actions/grantActions';

/** A blank field means "no limit"; anything else must be a whole number ≥ 1. */
function parseLimit(raw: string): number | null | 'bad' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 ? n : 'bad';
}

export function GrantDialog({
  eventId,
  ticketTypes,
  editing,
  open,
  onOpenChange,
}: {
  eventId: string;
  ticketTypes: GrantsView['ticketTypes'];
  /** Set to edit that grant's limits; unset to create one. */
  editing: GrantRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <GrantForm
            key={editing?.id ?? 'new'}
            eventId={eventId}
            ticketTypes={ticketTypes}
            editing={editing}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GrantForm({
  eventId,
  ticketTypes,
  editing,
  onDone,
}: {
  eventId: string;
  ticketTypes: GrantsView['ticketTypes'];
  editing: GrantRow | null;
  onDone: () => void;
}) {
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        editing
          ? editing.ticketTypes.map((t) => t.id)
          : ticketTypes.filter((t) => t.hidden).map((t) => t.id)
      )
  );
  const [maxUses, setMaxUses] = useState(editing?.maxUses?.toString() ?? '');
  const [quantity, setQuantity] = useState(editing?.quantity?.toString() ?? '');
  const [expiresAt, setExpiresAt] = useState<Date | undefined>(
    editing?.expiresAt ? new Date(editing.expiresAt) : undefined
  );
  const [holderEmail, setHolderEmail] = useState('');
  const [holderName, setHolderName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const uses = parseLimit(maxUses);
    const perOrder = parseLimit(quantity);
    if (uses === 'bad')
      return setError('Uses must be a whole number of 1 or more.');
    if (perOrder === 'bad' || (perOrder !== null && perOrder > 50)) {
      return setError('Tickets per order must be a whole number from 1 to 50.');
    }
    if (!editing && selected.size === 0) {
      return setError('Pick at least one ticket type.');
    }
    const expiryChanged =
      (expiresAt?.getTime() ?? null) !==
      (editing?.expiresAt ? new Date(editing.expiresAt).getTime() : null);
    if (expiryChanged && expiresAt && expiresAt <= new Date()) {
      return setError('The expiry must be in the future.');
    }

    setError(null);
    setSaving(true);
    const limits = {
      maxUses: uses,
      quantity: perOrder,
      expiresAt: expiresAt ?? null,
    };
    const result = editing
      ? await updateGrant(eventId, editing.id, limits)
      : await createGrant(eventId, {
          ...limits,
          code: code.trim() || undefined,
          ticketTypeIds: Array.from(selected),
          holderEmail: holderEmail.trim() || null,
          holderName: holderName.trim() || null,
        });
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    toast.success(
      editing
        ? `${editing.code} updated.`
        : `Code ${'code' in result ? result.code : ''} created.`
    );
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>
          {editing ? `Edit ${editing.code}` : 'New access code'}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? 'You can extend a code. Its text and ticket types stay as sent.'
            : 'A code unlocks the ticket types you pick. It never changes a price.'}
        </DialogDescription>
      </DialogHeader>

      {!editing && (
        <div className="space-y-2">
          <Label htmlFor="grant-code">Code</Label>
          <Input
            id="grant-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Leave blank to generate one"
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase placeholder:font-sans placeholder:normal-case"
            maxLength={100}
          />
        </div>
      )}

      {!editing && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Ticket types</legend>
          {ticketTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a ticket type first.
            </p>
          ) : (
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
                    <span>{t.name}</span>
                    {!t.hidden && (
                      <span className="text-xs text-muted-foreground">
                        public — the code only raises the per-order cap
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="grant-uses">Uses</Label>
          <Input
            id="grant-uses"
            inputMode="numeric"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Unlimited"
          />
          <p className="text-xs text-muted-foreground">
            {editing
              ? `Used ${editing.usedCount} so far.`
              : 'How many checkouts can use it.'}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="grant-quantity">Tickets per order</Label>
          <Input
            id="grant-quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Ticket type's limit"
          />
          <p className="text-xs text-muted-foreground">
            Replaces each ticket type&apos;s max per order.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Expires</Label>
          {expiresAt && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setExpiresAt(undefined)}
            >
              No expiry
            </button>
          )}
        </div>
        <DateTimeField
          value={expiresAt}
          onChange={setExpiresAt}
          disabledBefore={new Date()}
        />
        <p className="text-xs text-muted-foreground">
          Blank never expires. The ticket type&apos;s sale window still applies.
        </p>
      </div>

      {!editing && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="grant-holder-email">Issued to (email)</Label>
            <Input
              id="grant-holder-email"
              type="email"
              value={holderEmail}
              onChange={(e) => setHolderEmail(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-holder-name">Name</Label>
            <Input
              id="grant-holder-name"
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Optional"
              maxLength={100}
            />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? 'Save' : 'Create code'}
        </Button>
      </DialogFooter>
    </form>
  );
}
