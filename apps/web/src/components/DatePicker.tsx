import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

import { Calendar } from '@/components/ui/calendar';

interface DatePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  placeholder?: string;
}
export function DatePicker({
  date,
  onDateChange,
  placeholder = 'Pick a date',
}: DatePickerProps) {
  const isMobile = useIsMobile();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full min-w-[160px] justify-start text-left font-normal',

            !date && 'text-muted-foreground'
          )}
        >
          {!isMobile && <CalendarIcon className="mr-2 h-4 w-4 " />}
          {date ? format(date, 'LLL dd, y') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
