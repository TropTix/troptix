import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RequestPayoutDialog } from './RequestPayoutDialog';

export function RequestPayoutCard({
  availableCents,
  setupComplete,
  hasOpenRequest,
  holdbackLine,
  readOnly,
}: {
  availableCents: number;
  setupComplete: boolean;
  hasOpenRequest: boolean;
  holdbackLine: string;
  readOnly: boolean;
}) {
  const line = !setupComplete
    ? 'Finish payout setup to request your balance.'
    : hasOpenRequest
      ? 'Your open request is being processed — one at a time.'
      : availableCents <= 0
        ? 'Nothing to request yet.'
        : holdbackLine;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Request a payout</CardTitle>
          <CardDescription>{line}</CardDescription>
        </div>
        {!readOnly && (
          <RequestPayoutDialog
            availableCents={availableCents}
            disabled={!setupComplete || hasOpenRequest || availableCents <= 0}
          />
        )}
      </CardHeader>
    </Card>
  );
}
