'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type ApplyCodeOutcome = 'unlocked' | 'invalid' | 'failed';

const ERROR_COPY: Record<Exclude<ApplyCodeOutcome, 'unlocked'>, string> = {
  invalid: "That code didn't work. Check it and try again.",
  failed: "We couldn't check that code. Try again in a moment.",
};

export default function AccessCodeField({
  activeCode,
  onApply,
  onClear,
}: {
  activeCode: string | null;
  onApply: (code: string) => Promise<ApplyCodeOutcome>;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (activeCode) {
    return (
      <div
        data-testid="access-code-chip"
        className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-2.5 text-sm"
      >
        <span>
          Access code{' '}
          <span className="font-semibold tabular-nums">{activeCode}</span>{' '}
          applied
        </span>
        <button
          type="button"
          aria-label="Remove access code"
          onClick={onClear}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-primary"
      >
        Have an access code?
      </button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    const outcome = await onApply(trimmed);
    setPending(false);
    if (outcome === 'unlocked') {
      setCode('');
      setOpen(false);
    } else {
      setError(ERROR_COPY[outcome]);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <label htmlFor="access-code" className="text-sm font-semibold">
        Access code
      </label>
      <div className="flex gap-2">
        <Input
          id="access-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="Enter code"
          aria-invalid={!!error}
          className="h-11 uppercase"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {pending ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
