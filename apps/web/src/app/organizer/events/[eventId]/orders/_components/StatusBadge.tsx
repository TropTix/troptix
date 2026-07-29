import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
}

const getBadgeVariant = (status: string): BadgeProps['variant'] => {
  switch (
    status.toUpperCase() // Use uppercase for case-insensitive matching
  ) {
    case 'COMPLETED':
      return 'default'; // Or 'secondary', or a custom 'success' variant
    case 'PENDING':
      return 'outline';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'secondary'; // Fallback for unknown statuses
  }
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const variant = getBadgeVariant(status);

  return <Badge variant={variant}>{status}</Badge>;
}
