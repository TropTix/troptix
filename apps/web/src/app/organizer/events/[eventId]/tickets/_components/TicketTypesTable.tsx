'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Link2, Pencil, Search } from 'lucide-react';
import type { SaleState, TicketTypeRow } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPriceCents, getDateFormatter } from '@/lib/dateUtils';

const SALE_STATE: Record<
  SaleState,
  { label: string; variant: 'default' | 'outline' | 'secondary' }
> = {
  OnSale: { label: 'On Sale', variant: 'default' },
  Scheduled: { label: 'Scheduled', variant: 'outline' },
  Ended: { label: 'Ended', variant: 'secondary' },
};

function saleDate(iso: string) {
  return getDateFormatter(new Date(iso), 'MMM d, yyyy');
}

function RowAction({
  label,
  tip,
  onClick,
  children,
}: {
  label: string;
  tip: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClick}
        >
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function TicketTypesTable({
  ticketTypes,
  eventId,
  onEdit,
  onDuplicate,
}: {
  ticketTypes: TicketTypeRow[];
  eventId: string;
  onEdit: (ticketType: TicketTypeRow) => void;
  onDuplicate: (ticketType: TicketTypeRow) => void;
}) {
  const [query, setQuery] = useState('');
  const { copyToClipboard } = useCopyToClipboard();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(copiedTimer.current ?? undefined), []);

  async function copyInviteLink(ticketType: TicketTypeRow) {
    if (!ticketType.accessCode) return;
    const url = new URL(`/e/${eventId}`, window.location.origin);
    url.searchParams.set('code', ticketType.accessCode);
    const link = url.toString();
    if (await copyToClipboard(link)) {
      setCopiedId(ticketType.id);
      clearTimeout(copiedTimer.current ?? undefined);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 2000);
      toast.success('Invite link copied', {
        description: `Opens the event with ${ticketType.accessCode} applied. Anyone with the link can buy every ticket type that uses this code.`,
      });
    } else {
      toast.error("Couldn't copy the link", {
        description: `Copy it by hand: ${link}`,
      });
    }
  }

  const q = query.trim().toLowerCase();
  const visible =
    q === ''
      ? ticketTypes
      : ticketTypes.filter((t) => t.name.toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticket types"
            className="pl-8"
            aria-label="Search ticket types by name"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No ticket types match.
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {visible.map((ticketType) => (
              <li key={ticketType.id}>
                <button
                  type="button"
                  onClick={() => onEdit(ticketType)}
                  className="block w-full rounded-lg border p-4 text-left active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block truncate font-medium"
                        title={ticketType.name}
                      >
                        {ticketType.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatPriceCents(ticketType.displayPriceCents)}
                      </span>
                    </div>
                    <SaleStateBadge state={ticketType.saleState} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {saleDate(ticketType.saleStartsAt)}
                      {' – '}
                      {saleDate(ticketType.saleEndsAt)}
                    </span>
                    <span className="font-medium text-foreground">
                      {ticketType.sold.toLocaleString()} /{' '}
                      {ticketType.capacity.toLocaleString()}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-md border md:block">
            <TooltipProvider delayDuration={400}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Gross Price</TableHead>
                    <TableHead className="text-right">Display Price</TableHead>
                    <TableHead>Sold</TableHead>
                    <TableHead>Start Sale</TableHead>
                    <TableHead>End Sale</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((ticketType) => (
                    <TableRow key={ticketType.id}>
                      <TableCell className="p-0">
                        <button
                          type="button"
                          onClick={() => onEdit(ticketType)}
                          className="block w-full truncate px-4 py-3 text-left font-medium"
                          title={ticketType.name}
                        >
                          {ticketType.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <SaleStateBadge state={ticketType.saleState} />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPriceCents(ticketType.grossPriceCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPriceCents(ticketType.displayPriceCents)}
                      </TableCell>
                      <TableCell>
                        {ticketType.sold.toLocaleString()} /{' '}
                        {ticketType.capacity.toLocaleString()}
                      </TableCell>
                      <TableCell>{saleDate(ticketType.saleStartsAt)}</TableCell>
                      <TableCell>{saleDate(ticketType.saleEndsAt)}</TableCell>
                      <TableCell className="text-right">
                        <RowAction
                          label="Edit"
                          tip="Edit this ticket type"
                          onClick={() => onEdit(ticketType)}
                        >
                          <Pencil className="h-4 w-4" />
                        </RowAction>
                        <RowAction
                          label="Duplicate"
                          tip="Start a new ticket type from this one"
                          onClick={() => onDuplicate(ticketType)}
                        >
                          <Copy className="h-4 w-4" />
                        </RowAction>
                        {ticketType.accessCode && (
                          <RowAction
                            label="Copy invite link"
                            tip={
                              copiedId === ticketType.id
                                ? 'Copied'
                                : `Copy a link that opens the event with ${ticketType.accessCode} already applied`
                            }
                            onClick={() => copyInviteLink(ticketType)}
                          >
                            {copiedId === ticketType.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                          </RowAction>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>
        </>
      )}
    </div>
  );
}

function SaleStateBadge({ state }: { state: SaleState }) {
  const { label, variant } = SALE_STATE[state];
  return <Badge variant={variant}>{label}</Badge>;
}
