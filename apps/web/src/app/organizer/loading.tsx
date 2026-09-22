import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, DollarSign, Ticket, CalendarClock } from 'lucide-react';

const SkeletonMetricCard = () => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-7 w-20" />
    </CardContent>
  </Card>
);

const SkeletonRecentOrderRow = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-5 w-24" />
    </TableCell>
    <TableCell className="text-right">
      <Skeleton className="h-5 w-16 ml-auto" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-5 w-12" />
    </TableCell>
  </TableRow>
);

const SkeletonActiveEventRow = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-5 w-32" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-5 w-12" />
    </TableCell>
    <TableCell className="text-right">
      <Skeleton className="h-5 w-16 ml-auto" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-8 w-20 rounded-md" />
    </TableCell>
  </TableRow>
);

export default function OrganizerDashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <Skeleton className="h-6 w-32 mb-1" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-9 w-24 rounded-md ml-auto" />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Skeleton className="h-5 w-20" />
                    </TableHead>
                    <TableHead className="text-right">
                      <Skeleton className="h-5 w-16 ml-auto" />
                    </TableHead>
                    <TableHead>
                      <Skeleton className="h-5 w-12" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRecentOrderRow />
                  <SkeletonRecentOrderRow />
                  <SkeletonRecentOrderRow />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <DollarSign className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-28" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Ticket className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <CalendarClock className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-10" />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-72 w-full" />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-9 w-24 rounded-md ml-auto" />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <Skeleton className="h-5 w-24" />
                      </TableHead>
                      <TableHead>
                        <Skeleton className="h-5 w-12" />
                      </TableHead>
                      <TableHead className="text-right">
                        <Skeleton className="h-5 w-16 ml-auto" />
                      </TableHead>
                      <TableHead>
                        <Skeleton className="h-5 w-20" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <SkeletonActiveEventRow />
                    <SkeletonActiveEventRow />
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
