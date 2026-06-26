import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TypographyH1, TypographyP } from '@/components/ui/typography';

export default function EventNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4">
      <TypographyH1 text="Event Not Found" classes="mb-4" />
      <TypographyP
        text="Sorry, we couldn't find the event you were looking for."
        classes="mb-6 text-gray-600"
      />
      <Button asChild>
        <Link href="/events">Back to All Events</Link>
      </Button>
    </div>
  );
}
