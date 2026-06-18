import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the Clean layout (centered 620px column, inset poster). Phase 2 can
// refine this once the full page chrome lands.
export default function EventDetailPageLoading() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[620px] px-5 pb-24 pt-6">
        <Skeleton className="aspect-[4/5] w-full rounded-[22px]" />
        <Skeleton className="mt-6 h-9 w-3/4" />
        <Skeleton className="mt-2 h-5 w-1/2" />
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
        <Skeleton className="mt-5 h-5 w-36" />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </main>
  );
}
