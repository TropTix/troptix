import { formatInTimeZone } from 'date-fns-tz';

export function getDateFormatter(date: Date, formatString?: string) {
  const defaultFormat = 'MMM dd, yyyy, h:mm a';
  return `${formatInTimeZone(date, 'America/New_York', formatString || defaultFormat)}`;
}

export function getDateRangeFormatter(start: Date, end: Date) {
  const startDate = formatInTimeZone(
    start,
    'America/New_York',
    'EEEE MMM dd, yyyy'
  );
  const endDate = formatInTimeZone(
    end,
    'America/New_York',
    'EEEE MMM dd, yyyy'
  );

  if (startDate !== endDate) {
    return `${startDate} - ${endDate}`;
  }

  return startDate;
}

export function getTimeRangeFormatter(start: Date, end: Date) {
  return `${formatInTimeZone(start, 'America/New_York', 'h:mm a')} - ${formatInTimeZone(end, 'America/New_York', 'h:mm a')}`;
}

export const formatCurrency = (amount: number | null): string => {
  if (amount === null || isNaN(amount)) return '$--.--';
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
};

/**
 * Integer cents → currency. The API carries money as cents; formatting is the
 * UI edge's job, so this is where the two meet.
 */
export const formatCents = (cents: number | null): string =>
  formatCurrency(cents === null ? null : cents / 100);

export const combineDateTime = (
  datePart: Date | undefined,
  timePart: string
): Date | undefined => {
  if (!datePart) return undefined;
  const [hours, minutes] = timePart.split(':').map(Number);
  const newDate = new Date(datePart);
  if (!isNaN(hours) && !isNaN(minutes)) {
    newDate.setHours(hours, minutes, 0, 0); // Set hours and minutes, reset seconds/ms
  }
  return newDate;
};

export const formatTime = (date: Date | undefined): string => {
  if (!date) return '';
  return date.toTimeString().slice(0, 5); // Extracts HH:MM
};
