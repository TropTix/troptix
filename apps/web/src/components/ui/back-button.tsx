'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BackButtonProps = React.ComponentProps<typeof Button> & {
  href?: string;
};

export function BackButton({
  href,
  className,
  children,
  ...props
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn('gap-1', className)}
      onClick={handleClick}
      {...props}
    >
      <ArrowLeft className="h-4 w-4" />
      {children ?? 'Back'}
    </Button>
  );
}
