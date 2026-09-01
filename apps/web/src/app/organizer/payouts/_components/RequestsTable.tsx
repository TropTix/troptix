'use client';

import { useState, useTransition } from 'react';
import type { OrganizerPayoutRequest } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCents, getDateFormatter } from '@/lib/dateUtils';
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
}: {
  requests: OrganizerPayoutRequest[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payout requests</CardTitle>
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
                <RequestRow key={request.id} request={request} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RequestRow({ request }: { request: OrganizerPayoutRequest }) {
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
        {getDateFormatter(new Date(request.createdAt), 'MMM d, yyyy')}
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
        {request.status === 'REQUESTED' && (
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
        {request.resolvedAt
          ? getDateFormatter(new Date(request.resolvedAt), 'MMM d, yyyy')
          : ''}{' '}
        via bank transfer
        {request.reference ? `, ref ${request.reference}` : ''}
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
