'use client';

import { useState, useTransition } from 'react';
import type { OrganizerPayoutRequest, StripeAccountKind } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCents } from '@/lib/dateUtils';
import { LocalTime } from '@/components/LocalTime';
import { cancelPayoutRequest } from '../_actions/payoutActions';

const STATUS_VARIANTS = {
  REQUESTED: 'default',
  PAID: 'secondary',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
} as const satisfies Record<OrganizerPayoutRequest['status'], string>;

const STATUS_LABELS = {
  REQUESTED: 'Requested',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
} satisfies Record<OrganizerPayoutRequest['status'], string>;

export function RequestsTable({
  requests,
  readOnly = false,
  stripeKind = null,
  action,
}: {
  requests: OrganizerPayoutRequest[];
  readOnly?: boolean;
  /** Set when the organization is active on a Stripe rail; which one decides the note. */
  stripeKind?: StripeAccountKind | null;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payout requests</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No payout requests yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Resolution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  readOnly={readOnly}
                />
              ))}
            </TableBody>
          </Table>
        )}
        {stripeKind === 'CONNECT' && (
          <p className="mt-3 text-xs text-muted-foreground">
            Stripe deposits payouts to your bank within about two business days.
            Open your Stripe dashboard to track them.
          </p>
        )}
        {stripeKind === 'GLOBAL_PAYOUTS' && (
          <p className="mt-3 text-xs text-muted-foreground">
            Stripe converts payouts to your currency and deposits them within
            about a week.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RequestRow({
  request,
  readOnly,
}: {
  request: OrganizerPayoutRequest;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelPayoutRequest(request.id);
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <TableRow>
      <TableCell>
        <LocalTime at={request.createdAt} />
      </TableCell>
      <TableCell className="font-medium">
        {formatCents(request.amountCents)}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANTS[request.status]}>
          {STATUS_LABELS[request.status]}
        </Badge>
      </TableCell>
      <TableCell className="max-w-48 truncate text-muted-foreground">
        {request.note ?? '—'}
      </TableCell>
      <TableCell>
        <Resolution request={request} />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {request.status === 'REQUESTED' && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={cancel}
          >
            {isPending ? 'Cancelling…' : 'Cancel'}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function Resolution({ request }: { request: OrganizerPayoutRequest }) {
  if (request.status === 'PAID') {
    return (
      <span className="text-sm text-muted-foreground">
        {request.resolvedAt && <LocalTime at={request.resolvedAt} />}
        {request.rail === 'STRIPE'
          ? ` via Stripe${request.reference ? `, ${request.reference}` : ''}`
          : ` via bank transfer${request.reference ? `, ref ${request.reference}` : ''}`}
      </span>
    );
  }
  if (request.status === 'REJECTED') {
    return (
      <span className="text-sm text-muted-foreground">
        {request.adminNote ?? '—'}
      </span>
    );
  }
  return null;
}
