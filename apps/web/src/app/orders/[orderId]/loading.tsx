import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';

import { CalendarDays, MapPin, CheckCircle, PartyPopper } from 'lucide-react';

export default function OrderDetailsLoading() {
  return (
    <div className="min-h-screen bg-linear-to-br from-primary/10 via-background to-background">
      <div className="max-w-5xl mx-auto py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <Card className="mb-10 md:mb-12 shadow-xl overflow-hidden">
          <div className="md:flex">
            <div className="md:w-2/5 relative">
              <Skeleton className="w-full h-64 md:h-full" />
            </div>
            <div className="md:w-3/5 p-6 sm:p-8 flex flex-col justify-center">
              <div className="flex items-center text-primary mb-2">
                <PartyPopper className="h-6 w-6 mr-2 text-muted-foreground/50" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-9 w-3/4 mb-3" />
              <div className="flex items-center text-muted-foreground mb-1 text-sm sm:text-base">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground/50" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center text-muted-foreground text-sm sm:text-base mb-4">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground/50" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-10 w-full sm:w-48 mt-2 mb-4" />
              <Skeleton className="h-4 w-full mt-1" />
              <Skeleton className="h-4 w-3/4 mt-1" />
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-5 gap-6 lg:gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2 text-muted-foreground/50" />
                  <Skeleton className="h-6 w-40" />
                </CardTitle>
                <Skeleton className="h-4 w-32 mt-1" />
              </CardHeader>
              <CardContent className="space-y-3 text-sm sm:text-base">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <div className="flex justify-between items-center pt-1">
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </CardContent>
              <CardFooter>
                <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          </div>

          <div className="md:col-span-3">
            <Card className="shadow-lg">
              <CardHeader>
                <Skeleton className="h-7 w-1/2 mb-1" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <Skeleton className="h-5 w-1/3" />
                        <Skeleton className="h-5 w-1/4" />
                      </div>
                      <Skeleton className="h-4 w-1/2 mb-1" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
