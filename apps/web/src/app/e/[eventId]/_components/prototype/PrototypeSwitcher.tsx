'use client';

// PROTOTYPE — floating variant switcher for the checkout sign-in step. Not
// part of the design under evaluation; delete with the rest of ./prototype.

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const VARIANT_LABELS: Record<string, string> = {
  D: 'Email-first branch',
  A: 'Separate step',
  B: 'Merged into contact',
  C: 'Focused takeover',
};

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  );
}

export default function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: string[];
  current: string;
  onChange: (variant: string) => void;
}) {
  const cycle = (delta: number) => {
    const i = variants.indexOf(current);
    onChange(variants[(i + delta + variants.length) % variants.length]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowLeft') cycle(-1);
      if (e.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // No production gate: this only mounts inside the auth step, which itself
  // only exists when ?variant= is in the URL — needed so the PR preview
  // deploy (a production build) can demo the prototype.
  return (
    <div className="flex shrink-0 justify-center py-2">
      <div className="flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-zinc-100 shadow-lg ring-1 ring-white/20">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => cycle(-1)}
          className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 font-mono text-xs">
          {current} — {VARIANT_LABELS[current] ?? 'Variant'}
        </span>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => cycle(1)}
          className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/10"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
