'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

const EASE_OUT_STRONG = [0.23, 1, 0.32, 1] as const;

const variants = {
  enter: (dir: number) => ({
    y: `${dir * 100}%`,
    opacity: 0,
    filter: 'blur(2px)',
  }),
  center: { y: 0, opacity: 1, filter: 'blur(0px)' },
  exit: (dir: number) => ({
    y: `${-dir * 100}%`,
    opacity: 0,
    filter: 'blur(2px)',
  }),
};

/**
 * Text that rolls like a counter wheel when it changes: up when `value`
 * grows, down when it shrinks. `text` is what is shown; `value` only decides
 * the direction. Reduced motion drops the travel and keeps the fade.
 */
export function RollingText({
  value,
  text,
  className,
}: {
  value: number;
  text: string;
  className?: string;
}) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState(1);
  if (value !== prev) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
  }

  return (
    <span className={cn('inline-grid overflow-hidden', className)}>
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: EASE_OUT_STRONG }}
          className="col-start-1 row-start-1 whitespace-nowrap"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
