// app/not-found.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button'; // Adjust path if your components are elsewhere
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'; // Adjust path
import { AlertTriangle, Home, Search } from 'lucide-react'; // Optional: for icons

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center bg-background p-4 md:p-8">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight md:text-4xl">
            Oops! Page Not Found
          </CardTitle>
          <CardDescription className="mt-2 text-lg text-muted-foreground">
            The page you&apos;re looking for seems to have vanished or maybe it
            never existed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Don&apos;t worry, let&apos;s get you back on track. You can return
            to our homepage or browse through our available events.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Go to Homepage
            </Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/discover">
              <Search className="mr-2 h-4 w-4" />
              Browse Events
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <p className="mt-8 text-sm text-muted-foreground">Error Code: 404</p>
    </div>
  );
}
