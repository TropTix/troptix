'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Ban,
  Check,
  Link2,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import type { GrantRow, GrantStateDto, GrantsView } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { getDateFormatter } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { LocalTime } from '@/components/LocalTime';
import { resendInvitation, revokeGrant } from '../_actions/grantActions';
import { GrantDialog } from './GrantDialog';
import { InviteDialog } from './InviteDialog';

const STATE: Record<
  GrantStateDto,
  { label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  active: { label: 'Active', variant: 'default' },
  inUse: { label: 'Checkout in progress', variant: 'outline' },
  exhausted: { label: 'Used up', variant: 'secondary' },
  expired: { label: 'Expired', variant: 'secondary' },
  revoked: { label: 'Revoked', variant: 'secondary' },
};

type Filter = 'current' | 'revoked';

// Same formatter as the sale window on the ticket type list, so an expiry and
// a sale end set side by side read in the same zone.
function expiry(iso: string | null) {
  return iso
    ? getDateFormatter(new Date(iso), 'MMM d, yyyy, h:mm a zzz')
    : 'Never';
}

function uses(grant: GrantRow) {
  return grant.maxUses === null
    ? `${grant.usedCount} used`
    : `${grant.usedCount} / ${grant.maxUses}`;
}

export function AccessCodesManager({
  eventId,
  view,
}: {
  eventId: string;
  view: GrantsView;
}) {
  const [filter, setFilter] = useState<Filter>('current');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ editing: GrantRow | null } | null>(
    null
  );
  const [inviting, setInviting] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  async function resend(grant: GrantRow) {
    setResending(grant.id);
    const result = await resendInvitation(eventId, grant.id);
    setResending(null);
    if (result.success)
      toast.success(`Sent ${grant.code} to ${grant.holderEmail}.`);
    else toast.error(result.error);
  }
  const [revoking, setRevoking] = useState<GrantRow | null>(null);
  const { copyToClipboard } = useCopyToClipboard();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(copiedTimer.current ?? undefined), []);

  const revokedCount = view.grants.filter((g) => g.state === 'revoked').length;
  const q = query.trim().toLowerCase();
  const visible = view.grants.filter(
    (g) =>
      (filter === 'revoked') === (g.state === 'revoked') &&
      (q === '' ||
        g.code.toLowerCase().includes(q) ||
        (g.holderEmail ?? '').includes(q) ||
        (g.holderName ?? '').toLowerCase().includes(q))
  );

  async function copyLink(grant: GrantRow) {
    const url = new URL(`/e/${eventId}`, window.location.origin);
    url.searchParams.set('code', grant.code);
    const link = url.toString();
    if (await copyToClipboard(link)) {
      setCopiedId(grant.id);
      clearTimeout(copiedTimer.current ?? undefined);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
      toast.success('Link copied', {
        description: `Opens the event with ${grant.code} applied.`,
      });
    } else {
      toast.error("Couldn't copy the link", {
        description: `Copy it by hand: ${link}`,
      });
    }
  }

  function actions(grant: GrantRow) {
    const usable = grant.state === 'active' || grant.state === 'inUse';
    return (
      <div className="flex justify-end gap-1">
        {grant.holderEmail && grant.state === 'active' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={resending === grant.id}
            onClick={() => resend(grant)}
            aria-label={`Resend ${grant.code} to ${grant.holderEmail}`}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
        {usable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => copyLink(grant)}
            aria-label={`Copy link for ${grant.code}`}
          >
            {copiedId === grant.id ? (
              <Check className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </Button>
        )}
        {grant.state !== 'revoked' && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDialog({ editing: grant })}
              aria-label={`Edit ${grant.code}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setRevoking(grant)}
              aria-label={`Revoke ${grant.code}`}
            >
              <Ban className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    );
  }

  function stateBadge(grant: GrantRow) {
    const { label, variant } = STATE[grant.state];
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge variant={variant}>{label}</Badge>
        {grant.state === 'revoked' && grant.checkoutInProgress && (
          <span className="text-xs text-muted-foreground">
            Checkout in progress
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {(['current', 'revoked'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-3 py-1 text-sm',
                filter === f
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f === 'current' ? 'Codes' : `Revoked (${revokedCount})`}
            </button>
          ))}
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search codes or guests"
              className="pl-8"
              aria-label="Search access codes"
            />
          </div>
          <Button variant="outline" onClick={() => setInviting(true)}>
            <Mail className="mr-2 h-4 w-4" />
            Invite by email
          </Button>
          <Button onClick={() => setDialog({ editing: null })}>
            <Plus className="mr-2 h-4 w-4" />
            New code
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {view.grants.length === 0
              ? 'No access codes yet. Create one to sell a hidden ticket type.'
              : 'No codes match.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {visible.map((grant) => (
              <li key={grant.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold tracking-wide">
                      {grant.code}
                    </p>
                    {grant.holderEmail && (
                      <p className="truncate text-xs text-muted-foreground">
                        {grant.holderName ? `${grant.holderName} · ` : ''}
                        {grant.holderEmail}
                      </p>
                    )}
                    {grant.sentAt && (
                      <p className="text-xs text-muted-foreground">
                        Sent{' '}
                        <LocalTime
                          at={grant.sentAt}
                          dateFormat="MMM d, h:mm a"
                        />
                      </p>
                    )}
                  </div>
                  {stateBadge(grant)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {grant.ticketTypes.map((t) => t.name).join(', ')}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {uses(grant)}
                    {grant.quantity !== null &&
                      ` · up to ${grant.quantity} per order`}
                    {' · '}
                    {grant.expiresAt
                      ? `until ${expiry(grant.expiresAt)}`
                      : 'no expiry'}
                  </span>
                  {actions(grant)}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ticket types</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Per order</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <span className="block font-mono font-semibold tracking-wide">
                        {grant.code}
                      </span>
                      {grant.holderEmail && (
                        <span className="block text-xs text-muted-foreground">
                          {grant.holderName ? `${grant.holderName} · ` : ''}
                          {grant.holderEmail}
                        </span>
                      )}
                      {grant.sentAt && (
                        <span className="block text-xs text-muted-foreground">
                          Sent{' '}
                          <LocalTime
                            at={grant.sentAt}
                            dateFormat="MMM d, h:mm a"
                          />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{stateBadge(grant)}</TableCell>
                    <TableCell className="max-w-56 truncate">
                      {grant.ticketTypes.map((t) => t.name).join(', ')}
                    </TableCell>
                    <TableCell>{uses(grant)}</TableCell>
                    <TableCell>{grant.quantity ?? '—'}</TableCell>
                    <TableCell>{expiry(grant.expiresAt)}</TableCell>
                    <TableCell>{actions(grant)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <GrantDialog
        eventId={eventId}
        ticketTypes={view.ticketTypes}
        editing={dialog?.editing ?? null}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      />

      <InviteDialog
        eventId={eventId}
        ticketTypes={view.ticketTypes}
        open={inviting}
        onOpenChange={setInviting}
      />

      <RevokeDialog
        eventId={eventId}
        grant={revoking}
        onClose={() => setRevoking(null)}
      />
    </div>
  );
}

function RevokeDialog({
  eventId,
  grant,
  onClose,
}: {
  eventId: string;
  grant: GrantRow | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!grant) return;
    setPending(true);
    const result = await revokeGrant(eventId, grant.id);
    setPending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(`${grant.code} revoked.`);
    onClose();
  }

  return (
    <Dialog open={grant !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {grant?.code}?</DialogTitle>
          <DialogDescription>
            No new checkout can use this code. Anyone already checking out with
            it can still finish. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            Revoke
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
