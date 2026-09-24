import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function RequestPayoutCard({
  availableCents,
  setupComplete,
  hasOpenRequest,
  holdbackLine,
  action,
}: {
  availableCents: number;
  setupComplete: boolean;
  hasOpenRequest: boolean;
  holdbackLine: string;
  action?: React.ReactNode;
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
      <CardHeader>
        <CardTitle className="text-base">Request a payout</CardTitle>
        <CardDescription>{line}</CardDescription>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
    </Card>
  );
}
