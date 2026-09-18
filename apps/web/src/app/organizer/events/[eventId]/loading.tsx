import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Ticket,
  DollarSign,
  Clock,
  Copy,
  Share2,
  ArrowUpRight,
  CheckCheck,
  PieChart as PieChartIcon,
} from 'lucide-react';

const SkeletonMetricCard = ({ iconName }: { iconName: string }) => {
  let IconComponent;
  switch (iconName) {
    case 'Ticket':
      IconComponent = Ticket;
      break;
    case 'DollarSign':
      IconComponent = DollarSign;
      break;
    case 'Clock':
      IconComponent = Clock;
      break;
    case 'CheckCheck':
      IconComponent = CheckCheck;
      break;
    case 'PieChartIcon':
      IconComponent = PieChartIcon;
      break;
    default:
      IconComponent = Ticket;
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <IconComponent className="h-4 w-4 text-muted-foreground opacity-50" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-3 w-12 mt-1" />
      </CardContent>
    </Card>
  );
};

const SkeletonOrderRow = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-5 w-20" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-5 w-28" />
    </TableCell>
    <TableCell className="text-right">
      <Skeleton className="h-5 w-16 ml-auto" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-6 w-20 rounded-md" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-5 w-16" />
    </TableCell>
  </TableRow>
);

export default function EventOverviewLoading() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <section className="flex flex-col gap-3 md:gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-60 md:h-9 md:w-80" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
          <Skeleton className="h-5 grow" />
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonMetricCard iconName="Ticket" />
        <SkeletonMetricCard iconName="DollarSign" />
        <SkeletonMetricCard iconName="Clock" />
      </section>

      <section>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-56 mt-1" />
              </div>
              <Skeleton className="h-9 w-36 rounded-md" />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Skeleton className="h-5 w-16" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-5 w-24" />
                  </TableHead>
                  <TableHead className="text-right">
                    <Skeleton className="h-5 w-12 ml-auto" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-5 w-20" />
                  </TableHead>
                  <TableHead>
                    <Skeleton className="h-5 w-16" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonOrderRow />
                <SkeletonOrderRow />
                <SkeletonOrderRow />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-40" />
            <CheckCheck className="h-4 w-4 text-muted-foreground opacity-50" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-6">
            <div className="text-center">
              <Skeleton className="h-7 w-24 mb-1" />
              <Skeleton className="h-3 w-20 mb-4" />
              <Skeleton className="h-4 w-48" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-36" />
            <PieChartIcon className="h-4 w-4 text-muted-foreground opacity-50" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-48">
              <Skeleton className="h-40 w-40 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
