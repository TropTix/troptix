'use client';

import * as React from 'react';
import {
  addDays,
  addYears,
  differenceInCalendarDays,
  format,
  startOfDay,
  subYears,
} from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { combineDateTime, formatTime } from '@/lib/dateUtils';

// 15-minute grid: "HH:mm" values with "h:mma" labels ("5:30pm").
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return {
    value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    label: format(new Date(2000, 0, 1, h, m), 'h:mmaaa'),
  };
});

// An off-grid value (a saved 6:20pm from the old free-form input) is kept as
// an extra option so opening the editor never silently moves the time.
function TimeSelect({
  value,
  onChange,
}: {
  value: Date | undefined;
  onChange: (next: Date) => void;
}) {
  const current = formatTime(value);
  const onGrid = !current || TIME_OPTIONS.some((o) => o.value === current);
  const options =
    onGrid || !value
      ? TIME_OPTIONS
      : [
          ...TIME_OPTIONS,
          { value: current, label: format(value, 'h:mmaaa') },
        ].sort((a, b) => a.value.localeCompare(b.value));
  return (
    <Select
      value={current || undefined}
      onValueChange={(time) => {
        const next = combineDateTime(value, time);
        if (next) onChange(next);
      }}
    >
      <SelectTrigger className="w-28 shrink-0 font-normal">
        <SelectValue placeholder="Time" />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-64">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type DateTimeFieldProps = {
  /** Undefined renders a placeholder, never crashes — form state may be partial. */
  value?: Date;
  onChange: (next: Date) => void;
  /** Omit when a form's own FormLabel already labels the field. */
  label?: string;
  /** Days strictly before this date are unselectable (end-after-start guard). */
  disabledBefore?: Date;
  className?: string;
} & Omit<
  React.ComponentProps<typeof Button>,
  'value' | 'onChange' | 'className'
>;

/**
 * One control writing a single Date field: the trigger shows date and time
 * together; the popover holds the calendar and the 15-minute time list.
 * Reading the time out (`formatTime`) and folding it back in
 * (`combineDateTime`) is a matched pair (CLAUDE.md "Dates and times") — this
 * component is the one place that pair lives.
 *
 * Rest props (id, aria-*, ref) land on the trigger button, so a wrapping
 * FormControl's label/error wiring reaches the focusable control.
 */
export function DateTimeField({
  value,
  onChange,
  label,
  disabledBefore,
  className,
  ...triggerProps
}: DateTimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const anchor = value ?? new Date();
  return (
    <div className={cn('grid w-fit gap-2', className)}>
      {label ? <Label>{label}</Label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="font-normal" {...triggerProps}>
            <CalendarIcon className="text-muted-foreground" />
            {value ? (
              <>
                {format(value, 'LLL dd, y')}
                <span aria-hidden className="h-4 w-px bg-border" />
                {format(value, 'p')}
              </>
            ) : (
              <span className="text-muted-foreground">Select date & time</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={anchor}
            captionLayout="dropdown"
            // Without explicit bounds, the year dropdown clamps navigation to
            // the current year (react-day-picker v10 default).
            startMonth={subYears(anchor, 5)}
            endMonth={addYears(anchor, 5)}
            disabled={
              disabledBefore
                ? { before: startOfDay(disabledBefore) }
                : undefined
            }
            autoFocus
            onSelect={(d) => {
              const next = combineDateTime(d, formatTime(value));
              if (next) onChange(next);
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t p-3">
            <TimeSelect value={value} onChange={onChange} />
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

// Wall-clock span: calendar days plus clock minutes. Instant arithmetic
// (getTime deltas) counts DST offsets, which contradicts ADR 0021's "the
// wall clock is the truth" for venue-local event times.
function wallClockMinutesBetween(from: Date, to: Date): number {
  return (
    differenceInCalendarDays(to, from) * 1440 +
    (minutesOfDay(to) - minutesOfDay(from))
  );
}

// Shift `base` by the wall-clock delta from `from` to `to`, so a start move
// across a DST change never drifts the end's wall-clock time.
function shiftByWallClockDelta(base: Date, from: Date, to: Date): Date {
  const dayDelta = differenceInCalendarDays(to, from);
  const minuteTotal =
    minutesOfDay(base) + (minutesOfDay(to) - minutesOfDay(from));
  const dayCarry = Math.floor(minuteTotal / 1440);
  const minutes = minuteTotal - dayCarry * 1440;
  const shifted = addDays(base, dayDelta + dayCarry);
  shifted.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return shifted;
}

function formatDuration(mins: number): string {
  if (mins < 0) return 'ends before it starts';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [
    d > 0 ? `${d} ${d === 1 ? 'day' : 'days'}` : null,
    h > 0 ? `${h}h` : null,
    m > 0 ? `${m}m` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '0m';
}

/**
 * A linked start–end pair: moving the start shifts the end by the same
 * wall-clock delta so the duration holds; the end calendar can't go before
 * the start; the duration shows on a pill beside the start label. Range
 * validation messages stay with the owning form — the pill only signals.
 */
export function DateTimeRangeFields({
  start,
  end,
  onChange,
  startLabel = 'Starts',
  endLabel = 'Ends',
  startFieldProps,
  endFieldProps,
}: {
  start: Date;
  end: Date;
  onChange: (next: { start: Date; end: Date }) => void;
  startLabel?: string;
  endLabel?: string;
  /** Forwarded to the start trigger (id, aria-*, ref for focus-on-error). */
  startFieldProps?: Omit<DateTimeFieldProps, 'value' | 'onChange'>;
  /** Forwarded to the end trigger (id, aria-*, ref for focus-on-error). */
  endFieldProps?: Omit<DateTimeFieldProps, 'value' | 'onChange'>;
}) {
  const durationMins = wallClockMinutesBetween(start, end);
  // <= 0 matches the schemas' strict ends-after-starts refines, so the pill
  // never looks fine while the form shows a range error.
  const invalid = durationMins <= 0;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {/* Both columns get an equal-height label row so the fields align when
          side by side; the duration pill rides the Starts label, keeping one
          position at every viewport width. */}
      <div className="grid w-fit gap-2">
        <div className="flex h-5 items-center gap-2">
          <Label>{startLabel}</Label>
          <span
            className={cn(
              'rounded-full border px-2 py-px text-xs whitespace-nowrap',
              invalid
                ? 'border-destructive text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {formatDuration(durationMins)}
          </span>
        </div>
        <DateTimeField
          value={start}
          onChange={(next) =>
            onChange({
              start: next,
              end: shiftByWallClockDelta(end, start, next),
            })
          }
          {...startFieldProps}
        />
      </div>
      <div className="grid w-fit gap-2">
        <div className="flex h-5 items-center">
          <Label>{endLabel}</Label>
        </div>
        <DateTimeField
          value={end}
          onChange={(next) => onChange({ start, end: next })}
          disabledBefore={start}
          {...endFieldProps}
        />
      </div>
    </div>
  );
}
