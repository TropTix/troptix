import { Skeleton } from '@/components/ui/skeleton';

export default function DiscoverLoading() {
  return (
    <section className="relative isolate min-h-screen overflow-hidden bg-[#faf8f4]">
      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-6 sm:pt-32 lg:px-8">
        <header className="mb-12 sm:mb-16">
          <Skeleton className="h-12 w-56 bg-slate-200 sm:h-16 sm:w-72" />
        </header>

        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="w-full sm:w-[330px]">
              <Skeleton className="aspect-[4/5] w-full rounded-[26px] bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
