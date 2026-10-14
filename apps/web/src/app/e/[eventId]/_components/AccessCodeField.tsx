'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ApplyCodeOutcome = 'unlocked' | 'invalid' | 'failed';

const ERROR_COPY: Record<Exclude<ApplyCodeOutcome, 'unlocked'>, string> = {
  invalid: "That code didn't work. Check it and try again.",
  failed: "We couldn't check that code. Try again in a moment.",
};

// Press snaps on a strong ease-out; colour changes ease. Disabled never scales.
const PRESS =
  'transition-[transform_150ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] active:scale-[0.96] disabled:active:scale-100';

export default function AccessCodeField({
  activeCode,
  onApply,
  onClear,
  initial,
}: {
  activeCode: string | null;
  onApply: (code: string) => Promise<ApplyCodeOutcome>;
  onClear: () => void;
  /** A code that arrived by link and failed: shown prefilled with its error. */
  initial?: { code: string; outcome: Exclude<ApplyCodeOutcome, 'unlocked'> };
}) {
  const [code, setCode] = useState(initial?.code ?? '');
  const [error, setError] = useState<string | null>(
    initial ? ERROR_COPY[initial.outcome] : null
  );
  const [pending, setPending] = useState(false);
  const hasText = code.trim().length > 0;

  if (activeCode) {
    return (
      <div
        data-testid="access-code-chip"
        className="flex h-12 items-center justify-between rounded-xl border border-primary/30 bg-primary/5 pr-1.5 pl-4"
      >
        <p className="text-sm">
          <span className="text-muted-foreground">Code applied</span>
          <span className="mx-2 text-muted-foreground/50">·</span>
          <span className="font-semibold tracking-wide tabular-nums">
            {activeCode}
          </span>
        </p>
        <button
          type="button"
          aria-label="Remove access code"
          onClick={onClear}
          className={cn(
            'grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-foreground',
            PRESS
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!hasText || pending) return;
    setPending(true);
    setError(null);
    const outcome = await onApply(code.trim());
    setPending(false);
    if (outcome === 'unlocked') setCode('');
    else setError(ERROR_COPY[outcome]);
  }

  return (
    <form onSubmit={submit}>
      <div
        className={cn(
          'flex h-12 items-center rounded-xl border bg-card pr-1.5 pl-4 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40',
          error ? 'border-destructive/60' : 'border-border'
        )}
      >
        <input
          aria-label="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={pending}
          placeholder="Access code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={!!error}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-medium tracking-wide uppercase outline-none placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !hasText}
          className={cn(
            'h-9 rounded-lg px-3.5 text-sm font-semibold',
            hasText
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground',
            PRESS
          )}
        >
          {pending ? 'Applying…' : 'Apply'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 px-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
