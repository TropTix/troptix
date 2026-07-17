'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { SalesPoint } from '@troptix/api';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

interface TicketSalesChartProps {
  data: SalesPoint[];
  /** Hourly buckets get a time label; daily buckets get a date. */
  bucket: 'hour' | 'day';
}

const chartConfig = {
  tickets: {
    label: 'Tickets Sold',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function TicketSalesChart({ data, bucket }: TicketSalesChartProps) {
  const formatBucket = (value: string) => {
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return value;
    return bucket === 'hour'
      ? at.toLocaleTimeString('en-US', { hour: 'numeric' })
      : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <ChartContainer config={chartConfig} className="h-[250px] w-full">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ left: 12, right: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="at"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatBucket}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
          domain={[0, 'auto']}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={formatBucket} />}
        />
        <Area
          dataKey="tickets"
          type="monotoneX"
          fill="var(--color-tickets)"
          fillOpacity={0.4}
          stroke="var(--color-tickets)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
