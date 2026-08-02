import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function EventNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4">
      <h1 className="mb-4 scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
        Event Not Found
      </h1>
      <p className="mb-6 text-base leading-7 text-muted-foreground">
        Sorry, we couldn&apos;t find the event you were looking for.
      </p>
      <Button asChild>
        <Link href="/discover">Back to All Events</Link>
      </Button>
    </div>
  );
}
