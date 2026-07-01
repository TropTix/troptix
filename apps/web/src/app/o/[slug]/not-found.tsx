import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-center text-foreground">
      <div>
        <h1 className="text-2xl font-bold">Organization not found</h1>
        <p className="mt-2 text-muted-foreground">
          This page doesn’t exist or the link has changed.
        </p>
        <Button asChild className="mt-6">
          <Link href="/discover">Discover events</Link>
        </Button>
      </div>
    </main>
  );
}
