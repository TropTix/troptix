import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'border-t border-border px-4 py-6 text-center text-xs text-muted-foreground',
        className
      )}
    >
      <nav className="flex justify-center gap-4">
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacypolicy" className="hover:text-foreground">
          Privacy
        </Link>
      </nav>
      <p className="mt-2">© {new Date().getFullYear()} TropTix</p>
    </footer>
  );
}
