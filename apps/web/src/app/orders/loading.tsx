import type { CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// Same grid and card geometry as the orders page, so the real cards land in
// place. Each card's bones pulse a beat after the previous card's.
const SkeletonOrderCard = ({ index }: { index: number }) => (
  <div
    className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/6"
    style={{ '--stagger': `${index * 120}ms` } as CSSProperties}
  >
    <Skeleton className="aspect-4/5 w-full rounded-none" />
    <div className="space-y-2 px-4 pt-3.5 pb-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
    </div>
  </div>
);

export default function OrdersLoading() {
  return (
    <div className="container mt-16 w-full md:mt-20 min-h-screen px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          My Orders
        </h1>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonOrderCard key={i} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
