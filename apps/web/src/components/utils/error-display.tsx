'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';

interface ErrorDisplayProps {
  /** Heading text. Defaults to the branded "UH OH !!". */
  title?: string;
  /** Supporting copy shown under the heading. */
  message?: string;
  /** Label for the primary recovery button. */
  resetLabel?: string;
  /** Invoked when the user clicks the primary recovery button. */
  onReset?: () => void;
}

/**
 * Branded full-bleed error fallback shared by the App Router error boundaries
 * (`app/error.tsx`, `app/organizer/error.tsx`). Purely presentational and
 * dependency-light so it can render even when app providers have failed.
 */
export function ErrorDisplay({
  title = 'UH OH !!',
  message = "Just pretend you didn't see anything....",
  resetLabel = 'Try again',
  onReset,
}: ErrorDisplayProps) {
  return (
    <section className="relative">
      <div
        className="absolute left-1/2 transform -translate-x-1/2 bottom-0 pointer-events-none -z-1"
        aria-hidden="true"
      >
        <svg
          width="1360"
          height="578"
          viewBox="0 0 1360 578"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              x1="50%"
              y1="0%"
              x2="50%"
              y2="100%"
              id="illustration-01"
            >
              <stop stopColor="#FFF" offset="0%" />
              <stop stopColor="#EAEAEA" offset="77.402%" />
              <stop stopColor="#DFDFDF" offset="100%" />
            </linearGradient>
          </defs>
          <g fill="url(#illustration-01)" fillRule="evenodd">
            <circle cx="1232" cy="128" r="128" />
            <circle cx="155" cy="443" r="64" />
          </g>
        </svg>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-32 pb-12 md:pt-40 md:pb-12">
          <div className="text-center pb-12 md:pb-16">
            <h1 className="text-3xl md:text-6xl font-extrabold leading-tighter tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-teal-400">
              {title}
            </h1>

            <div className="max-w-3xl mx-auto">
              <p className="text-xl text-gray-600 mb-8">{message}</p>

              <div className="max-w-xs mx-auto sm:max-w-none sm:flex sm:justify-center sm:gap-4">
                {onReset && (
                  <Button
                    onClick={onReset}
                    className="w-full mb-4 sm:w-auto sm:mb-0"
                  >
                    {resetLabel}
                  </Button>
                )}
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href="/">Back to home</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
