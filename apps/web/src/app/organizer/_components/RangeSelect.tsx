'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { DashboardRange } from '@troptix/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RANGE_LABELS } from './ranges';

/**
 * Drives the dashboard's range via the URL, so the page stays a server
 * component and the range survives a refresh or a shared link.
 */
export function RangeSelect({ value }: { value: DashboardRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    // Preserve the other params (notably ?viewAs) rather than clobbering them.
    const params = new URLSearchParams(searchParams?.toString());
    params.set('range', next);
    startTransition(() => router.push(`?${params}`, { scroll: false }));
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="w-[160px]"
        aria-label="Select a time range"
        data-pending={isPending ? '' : undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(RANGE_LABELS).map(([range, label]) => (
          <SelectItem key={range} value={range}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
