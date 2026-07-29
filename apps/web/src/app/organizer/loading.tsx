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
      <Skeleton className="h-4 w-24" /> {/* CardTitle */}
      <Skeleton className="h-4 w-4" /> {/* Icon Placeholder */}
    </CardHeader>
    <CardContent>
      <Skeleton className="h-7 w-20" /> {/* Main Value */}
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
      <Skeleton className="h-8 w-20 rounded-md" /> {/* Button Placeholder */}
    </TableCell>
  </TableRow>
);

export default function OrganizerDashboardLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-72" /> {/* Page Title: Dashboard Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Left Column (Recent Orders) */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <Skeleton className="h-6 w-32 mb-1" />{' '}
                {/* CardTitle: Recent Orders */}
                <Skeleton className="h-4 w-48" /> {/* CardDescription */}
              </div>
              <Skeleton className="h-9 w-24 rounded-md ml-auto" />{' '}
              {/* View All Button */}
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

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Top Metrics Cards */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />{' '}
                {/* CardTitle: Total Revenue */}
                <DollarSign className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-28" /> {/* Value */}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />{' '}
                {/* CardTitle: Tickets Sold */}
                <Ticket className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" /> {/* Value */}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />{' '}
                {/* CardTitle: Active Events */}
                <CalendarClock className="h-4 w-4 text-muted-foreground opacity-50" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-10" /> {/* Value */}
              </CardContent>
            </Card>
          </section>

          {/* 2. Chart */}
          <section>
            <Card>
              <CardHeader>
                {/* You could add a skeleton for a chart title if it has one */}
                <Skeleton className="h-5 w-40" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-72 w-full" />{' '}
                {/* Chart Area Placeholder */}
              </CardContent>
            </Card>
          </section>

          {/* 3. Active Events List */}
          <section>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-6 w-32" />{' '}
                {/* CardTitle: Active Events */}
                <Skeleton className="h-9 w-24 rounded-md ml-auto" />{' '}
                {/* View All Button */}
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
