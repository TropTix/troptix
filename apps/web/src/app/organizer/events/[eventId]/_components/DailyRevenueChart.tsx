'use client';

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
interface DailyRevenueDataPoint {
  date: string;
  revenue: number;
}

interface DailyRevenueChartProps {
  data: DailyRevenueDataPoint[];
}

const revenueChartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const formatDate = (value: string) => {
  try {
    return format(new Date(value + 'T00:00:00'), 'MMM d'); // e.g., "Apr 25"
  } catch (error) {
    console.error('Error formatting date:', value, error);
    return value;
  }
};

export function DailyRevenueChart({ data }: DailyRevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No revenue data available for this period.
      </div>
    );
  }
  return (
    <ChartContainer config={revenueChartConfig} className="h-[250px] w-full">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{
          left: 12, // Space for Y-axis labels
          right: 12,
          top: 10,
          bottom: 0,
        }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatCurrency}
          width={80}
        />
        <ChartTooltip
          cursor={true}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => {
                if (name === 'revenue' && typeof value === 'number') {
                  return formatCurrency(value);
                }
                return String(value);
              }}
              indicator="dot"
            />
          }
        />
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-revenue)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-revenue)"
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <Area
          dataKey="revenue"
          type="monotone"
          fill="url(#fillRevenue)"
          stroke="var(--color-revenue)"
          strokeWidth={2}
          stackId="a"
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
