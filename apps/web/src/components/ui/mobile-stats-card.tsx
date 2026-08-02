import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface MobileStatsCardProps {
  icon: LucideIcon;
  iconColor?: string;
  value: string | number;
  valueColor?: string;
  label: string;
  secondaryInfo?: string;
}

export const MobileStatsCard: React.FC<MobileStatsCardProps> = ({
  icon: Icon,
  iconColor = 'text-muted-foreground',
  value,
  valueColor = 'text-xl font-bold',
  label,
  secondaryInfo,
}) => {
  return (
    <Card className="shrink-0 w-32 aspect-square">
      <CardContent className="p-4 h-full flex flex-col items-center justify-center text-center">
        <Icon className={`h-6 w-6 ${iconColor} mb-2`} />
        <div className={valueColor}>{value}</div>
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        {secondaryInfo && (
          <p className="text-xs text-muted-foreground leading-tight">
            {secondaryInfo}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

interface MobileStatsContainerProps {
  children: React.ReactNode;
}

export const MobileStatsContainer: React.FC<MobileStatsContainerProps> = ({
  children,
}) => {
  return (
    <div className="md:hidden">
      <div className="flex gap-3 overflow-x-auto pb-4 px-4 -mx-4">
        {children}
      </div>
    </div>
  );
};
