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
              <StripeWordmark />
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

/** Stripe wordmark — official purple (#635BFF), lowercase. Rendered as text
 *  to guarantee a crisp, correct render (matches the Supabase text treatment). */
function StripeWordmark() {
  return (
    <span className="text-2xl sm:text-3xl font-bold lowercase tracking-tight text-[#635BFF]">
      stripe
    </span>
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
