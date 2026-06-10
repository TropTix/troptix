'use client';

import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

/**
 * "Powered by" trust strip — a thin, logo-driven band that answers
 * "is my money safe?" in half a second of scanning. Sits directly under the
 * hero. Infrastructure-only (Stripe, Supabase); the team story lives in the
 * About section so the two signals don't compete.
 */
export default function PoweredBy() {
  return (
    <section
      aria-labelledby="powered-by-heading"
      className="relative border-y border-slate-900/[0.06] bg-white"
    >
      <div className="container mx-auto px-5 sm:px-6 lg:px-8 py-12 sm:py-14">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center"
        >
          <p
            id="powered-by-heading"
            className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Secure, world-class infrastructure
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
            <BrandLogo label="Payments by Stripe">
              <StripeWordmark className="h-7 sm:h-8 w-auto" />
            </BrandLogo>

            <span
              aria-hidden
              className="hidden sm:block h-8 w-px bg-slate-900/[0.08]"
            />

            <BrandLogo label="Built on Supabase">
              <SupabaseLogo className="h-7 sm:h-8 w-auto" />
            </BrandLogo>
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-7 max-w-xl text-sm text-slate-500 leading-relaxed text-balance"
          >
            PCI-compliant checkout powered by{' '}
            <span className="font-medium text-slate-700">Stripe</span> and built
            on <span className="font-medium text-slate-700">Supabase</span> —
            your money and your data are protected by the same technology
            trusted by millions of businesses worldwide.
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

function BrandLogo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center opacity-80 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
      aria-label={label}
      title={label}
    >
      {children}
    </span>
  );
}

/** Stripe wordmark — official purple (#635BFF), lowercase geometric mark. */
function StripeWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 25"
      className={className}
      role="img"
      aria-hidden
      fill="#635BFF"
    >
      <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48Zm-8.1-2.9h4.16c0-1.86-1.06-2.65-2.05-2.65-1.02 0-2.13.79-2.12 2.65Zm-9.06-5.1c1.95 0 3.45 1.92 3.45 5.86 0 4.32-1.47 5.86-3.46 5.86-1.13 0-1.8-.4-2.27-.95l-.02 4.78-3.83.82V5.54h3.42l.2.94c.45-.6 1.27-1.2 2.51-1.2Zm-.91 7.86c1.25 0 1.7-1.36 1.7-2.94 0-1.6-.45-2.94-1.7-2.94-.74 0-1.17.27-1.46.65l.02 4.6c.28.3.7.63 1.44.63ZM33.1 5.54h3.84v14.42h-3.84V5.54Zm0-3.96L36.94 0v2.9l-3.84.82V1.58Zm-4.32 7.55v10.83h-3.83V5.54h3.32l.24 1.22c.9-1.6 2.69-1.42 3.16-1.27v3.52c-.45-.15-1.99-.37-2.89.62Zm-8.06-1.22c-.79 0-1.27.22-1.27.8 0 .63.82.9 1.83 1.24 1.65.56 3.81 1.32 3.82 4.03 0 2.63-2.1 4.15-5.15 4.15a10.2 10.2 0 0 1-4.01-.83v-3.65c1.3.71 2.94 1.24 4.02 1.24.83 0 1.42-.22 1.42-.91 0-.7-.89-1.02-1.96-1.39-1.62-.55-3.66-1.24-3.66-3.85 0-2.6 1.99-4.16 4.96-4.16 1.3 0 2.6.2 3.9.72v3.6c-1.2-.64-2.71-1-3.9-1Zm-9.78-2.37h2.7v3.26h-2.7v6.13c0 1.7 1.82 1.17 2.7.82v3.26c-.91.5-2.05.67-3.05.67-2.58 0-4.51-1.51-4.51-4.08L8.07.74l3.74-.79.01 3.92h2.62v-.74Z" />
    </svg>
  );
}

/** Supabase logo — official mark (green bolt) + wordmark. */
function SupabaseLogo({ className }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 109 113"
        className={className}
        role="img"
        aria-hidden
        fill="none"
      >
        <path
          d="M63.708 110.284c-2.86 3.601-8.658 1.628-8.727-2.97l-1.007-67.251h45.22c8.19 0 12.758 9.46 7.665 15.875l-43.151 54.346Z"
          fill="url(#sb-a)"
        />
        <path
          d="M63.708 110.284c-2.86 3.601-8.658 1.628-8.727-2.97l-1.007-67.251h45.22c8.19 0 12.758 9.46 7.665 15.875l-43.151 54.346Z"
          fill="url(#sb-b)"
          fillOpacity=".2"
        />
        <path
          d="M45.317 2.07c2.86-3.601 8.657-1.628 8.726 2.97l.442 67.251H9.83c-8.19 0-12.758-9.46-7.665-15.875L45.317 2.07Z"
          fill="#3ECF8E"
        />
        <defs>
          <linearGradient
            id="sb-a"
            x1="53.974"
            y1="54.974"
            x2="94.163"
            y2="71.829"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#249361" />
            <stop offset="1" stopColor="#3ECF8E" />
          </linearGradient>
          <linearGradient
            id="sb-b"
            x1="36.156"
            y1="30.578"
            x2="54.484"
            y2="65.081"
            gradientUnits="userSpaceOnUse"
          >
            <stop />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-800">
        Supabase
      </span>
    </span>
  );
}
