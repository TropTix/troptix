import { TypographyH1 } from '@/components/ui/typography';
import { TypographyP } from '@/components/ui/typography';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function OrderNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center p-4">
      <TypographyH1 text="Order Not Found" classes="mb-4" />
      <TypographyP
        text="Sorry, we couldn't find the tickets you were looking for."
        classes="mb-6 text-muted-foreground"
      />
      <Button asChild>
        <Link href="/orders">Back to Orders</Link>
      </Button>
    </div>
  );
}
