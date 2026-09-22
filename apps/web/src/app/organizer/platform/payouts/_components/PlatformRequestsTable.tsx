'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, ExternalLink } from 'lucide-react';
import type { PayoutRailDto, PlatformPayoutRequest } from '@troptix/api';

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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCents } from '@/lib/dateUtils';
import { LocalTime } from '@/components/LocalTime';
import { resolvePayoutRequest } from '../_actions/platformPayoutActions';

const STATUS_VARIANTS = {
  REQUESTED: 'default',
  PAID: 'secondary',
  REJECTED: 'destructive',
  CANCELLED: 'outline',
} as const satisfies Record<PlatformPayoutRequest['status'], string>;

const RAIL_LABELS = {
  MERCURY: 'Mercury',
  STRIPE: 'Stripe',
  OTHER: 'Other',
} satisfies Record<PayoutRailDto, string>;

export function PlatformRequestsTable({
  requests,
}: {
  requests: PlatformPayoutRequest[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payout requests</CardTitle>
        <CardDescription>
          Open requests first. Mark paid after sending the transfer from the ops
          bank.
        </CardDescription>
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
                <TableHead>Organization</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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

function RequestRow({ request }: { request: PlatformPayoutRequest }) {
  const [panel, setPanel] = useState<'pay' | 'reject' | null>(null);

  return (
    <>
      <TableRow>
        <TableCell>
          <p className="font-medium">{request.organizationName}</p>
          <p className="text-xs text-muted-foreground">{request.ownerEmail}</p>
        </TableCell>
        <TableCell className="font-medium">
          {formatCents(request.amountCents)}
        </TableCell>
        <TableCell className="max-w-48 truncate text-muted-foreground">
          {request.note ?? '—'}
        </TableCell>
        <TableCell className="text-muted-foreground">
          <LocalTime at={request.createdAt} />
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANTS[request.status]}>
            {request.status}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          {request.status === 'REQUESTED' ? (
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant={panel === 'pay' ? 'secondary' : 'default'}
                onClick={() => setPanel(panel === 'pay' ? null : 'pay')}
              >
                Mark paid
              </Button>
              <Button
                size="sm"
                variant={panel === 'reject' ? 'secondary' : 'outline'}
                onClick={() => setPanel(panel === 'reject' ? null : 'reject')}
              >
                Reject
              </Button>
            </div>
          ) : (
            <ResolutionSummary request={request} />
          )}
        </TableCell>
      </TableRow>

      {panel === 'pay' && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6}>
            <MarkPaidPanel request={request} onDone={() => setPanel(null)} />
          </TableCell>
        </TableRow>
      )}
      {panel === 'reject' && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6}>
            <RejectPanel request={request} onDone={() => setPanel(null)} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ResolutionSummary({ request }: { request: PlatformPayoutRequest }) {
  if (request.status === 'PAID') {
    return (
      <span className="text-xs text-muted-foreground">
        {request.rail ? RAIL_LABELS[request.rail] : ''}
        {request.reference ? ` · ${request.reference}` : ''}
      </span>
    );
  }
  if (request.status === 'REJECTED') {
    return (
      <span className="text-xs text-muted-foreground">{request.adminNote}</span>
    );
  }
  return null;
}

/**
 * The manual-transfer cockpit: everything to copy into the bank, and the
 * reference to paste back. The memo out + reference in is what reconciles the
 * request row against the bank statement both ways.
 */
function MarkPaidPanel({
  request,
  onDone,
}: {
  request: PlatformPayoutRequest;
  onDone: () => void;
}) {
  const memo = `TropTix payout — ${request.organizationSlug} — ${request.id.slice(0, 8)}`;
  const [rail, setRail] = useState<PayoutRailDto>('MERCURY');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await resolvePayoutRequest({
        id: request.id,
        outcome: 'PAID',
        rail,
        reference: reference.trim() || undefined,
      });
      if (result.success) {
        onDone();
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <div className="space-y-4 rounded-lg bg-muted/40 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <CopyField
          label="Amount"
          value={(request.amountCents / 100).toFixed(2)}
        />
        <CopyField label="Payee memo" value={memo} wide />
        <Button asChild variant="outline" size="sm">
          <a href="https://app.mercury.com" target="_blank" rel="noreferrer">
            Open Mercury
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label>Rail</Label>
          <Select
            value={rail}
            onValueChange={(value) => setRail(value as PayoutRailDto)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RAIL_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ref-${request.id}`}>Bank transfer reference</Label>
          <Input
            id={`ref-${request.id}`}
            className="w-64"
            placeholder="Paste the bank's transaction id"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </div>
        <Button disabled={isPending} onClick={confirm}>
          {isPending
            ? 'Saving…'
            : `Confirm paid ${formatCents(request.amountCents)}`}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const rejectSchema = z.object({
  adminNote: z
    .string()
    .trim()
    .min(1, 'A reason is required — the organizer sees it.')
    .max(500),
});

function RejectPanel({
  request,
  onDone,
}: {
  request: PlatformPayoutRequest;
  onDone: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof rejectSchema>>({
    resolver: zodResolver(rejectSchema),
    defaultValues: { adminNote: '' },
  });

  const confirm = (values: z.infer<typeof rejectSchema>) => {
    setServerError(null);
    startTransition(async () => {
      const result = await resolvePayoutRequest({
        id: request.id,
        outcome: 'REJECTED',
        adminNote: values.adminNote,
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
        onSubmit={form.handleSubmit(confirm)}
        className="space-y-3 rounded-lg bg-muted/40 p-4"
      >
        <FormField
          control={form.control}
          name="adminNote"
          render={({ field }) => (
            <FormItem className="sm:max-w-md">
              <FormLabel>Reason (shown to the organizer)</FormLabel>
              <FormControl>
                <Textarea maxLength={500} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}
        <Button type="submit" variant="destructive" disabled={isPending}>
          {isPending ? 'Saving…' : 'Confirm rejection'}
        </Button>
      </form>
    </Form>
  );
}

function CopyField({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setResult('copied');
    } catch {
      setResult('failed');
    }
    setTimeout(() => setResult(null), 2000);
  };

  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-1.5">
        <Input readOnly value={value} className={wide ? 'w-80' : 'w-32'} />
        <Button variant="outline" size="icon" onClick={copy} title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {result === 'copied' && (
          <span className="self-center text-xs text-muted-foreground">
            Copied
          </span>
        )}
        {result === 'failed' && (
          <span className="self-center text-xs text-destructive">
            Copy failed — select the field and copy by hand
          </span>
        )}
      </div>
    </div>
  );
}
