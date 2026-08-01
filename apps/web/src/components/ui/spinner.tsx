import { Loader2 } from 'lucide-react';

export function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden />
      {text && <div className="mt-4 text-center text-base">{text}</div>}
    </div>
  );
}
