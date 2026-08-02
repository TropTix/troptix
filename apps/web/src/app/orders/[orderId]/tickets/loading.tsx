import { Skeleton } from '@/components/ui/skeleton';

const SkeletonTicketCard = () => (
  <div className="bg-card shadow-lg rounded-lg overflow-hidden">
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-start">
        <div className="mb-4 sm:mb-0">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-32 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
    <Skeleton className="h-20 w-full" />
  </div>
);

export default function OrderTicketsLoading() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center gap-4">
        <div className="p-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground">
          <Skeleton className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <Skeleton className="h-9 w-72 sm:w-96 mb-2" />
          <Skeleton className="h-6 w-48 sm:w-64" />
        </div>
      </div>

      <div className="space-y-6">
        <SkeletonTicketCard />
        <SkeletonTicketCard />
        <SkeletonTicketCard />
      </div>
    </div>
  );
}
