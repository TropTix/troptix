import { Skeleton } from '@/components/ui/skeleton';

// Keep in sync with EventPageClean's layout.
export default function EventDetailPageLoading() {
  return (
    <main className="min-h-screen bg-background">
      {/* Mobile hero */}
      <Skeleton className="aspect-[4/5] w-full rounded-b-3xl md:hidden" />

      <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-8 md:py-14">
        <div className="md:grid md:grid-cols-[minmax(0,380px)_1fr] md:items-start md:gap-12">
          <aside className="hidden md:block">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="mt-5 border-t border-border pt-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-5 w-40" />
            </div>
          </aside>

          <div className="mt-6 md:mt-0">
            <Skeleton className="h-10 w-3/4 md:h-12" />
            <Skeleton className="mt-3 h-6 w-1/2" />
            <div className="mt-6 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
