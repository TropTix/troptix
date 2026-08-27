import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  PlusCircle,
  Eye,
  Edit,
  Settings,
  Image as ImageIcon,
} from 'lucide-react';

const SkeletonEventCard = () => (
  <Card className="overflow-hidden flex flex-col">
    <div className="relative w-full shrink-0 aspect-video bg-muted">
      <div className="w-full h-full flex items-center justify-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground" />
      </div>
    </div>
    <div className="flex flex-1 flex-col p-4 md:p-6">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
        <Skeleton className="h-4 w-1/2 mb-1" />
        <Skeleton className="h-4 w-1/3 mb-3" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-5/6 mb-4" />
      </div>
      <div className="flex flex-wrap gap-2 justify-end items-center mt-auto pt-4 border-t">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    </div>
  </Card>
);

export default function AllEventsListLoading() {
  const numberOfPlaceholderSections = 2;
  const cardsPerSection = 3;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-10 w-48 rounded-md" />
      </div>

      <div className="space-y-8">
        {Array.from({ length: numberOfPlaceholderSections }).map(
          (_, sectionIndex) => (
            <section key={`skeleton-section-${sectionIndex}`}>
              <Skeleton className="h-7 w-40 mb-4" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: cardsPerSection }).map((_, cardIndex) => (
                  <SkeletonEventCard
                    key={`skeleton-card-${sectionIndex}-${cardIndex}`}
                  />
                ))}
              </div>
            </section>
          )
        )}
      </div>
    </div>
  );
}
