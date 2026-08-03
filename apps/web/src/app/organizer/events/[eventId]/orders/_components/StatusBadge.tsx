import * as React from 'react';
import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
}

const getBadgeVariant = (
  status: string
): React.ComponentProps<typeof Badge>['variant'] => {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'default';
    case 'PENDING':
      return 'outline';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'secondary';
  }
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const variant = getBadgeVariant(status);

  return <Badge variant={variant}>{status}</Badge>;
}
