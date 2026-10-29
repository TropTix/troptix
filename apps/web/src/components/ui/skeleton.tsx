import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-accent [animation-delay:var(--stagger,0ms)]',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
