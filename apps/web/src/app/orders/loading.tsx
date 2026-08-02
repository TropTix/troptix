import { Skeleton } from '@/components/ui/skeleton';
import { Ticket } from 'lucide-react';

const SkeletonOrderCard = () => {
  return (
    <div className="max-w-lg bg-white rounded-xl shadow-lg p-4 flex flex-row items-center space-y-0 space-x-4 mx-auto">
      <div className="my-auto">
        <Skeleton className="w-[150px] h-[150px] rounded" />
      </div>
      <div className="ml-4 my-auto grow w-full space-y-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex items-center pt-1">
          <Ticket className="w-4 h-4 mr-1 text-muted-foreground/50" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </div>
  );
};

export default function OrdersLoading() {
  return (
    <div className="container mt-20 w-full md:mt-28 min-h-screen px-4 py-8">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Your Tickets
        </h1>
      </div>

      <div className="grid items-center justify-center grid-cols-1 gap-4 w-full mx-auto">
        <SkeletonOrderCard />
        <SkeletonOrderCard />
        <SkeletonOrderCard />
      </div>
    </div>
  );
}
