'use client';

import { motion } from 'motion/react';
import { Globe2, HeartHandshake, Sparkles } from 'lucide-react';

/**
 * "Made in Jamaica" about section — the team story. Sits after the organizer
 * CTA, before the footer, where an interested visitor wants to know who's
 * behind the product.
 *
 * Credentials use past-experience framing ("experience at...") — a credential,
 * not an implied endorsement. The company wordmarks are kept visually quieter
 * than the Stripe/Supabase trust strip so they read as background, not as
 * partnerships. Harvard appears once, woven into the "brought it home"
 * narrative rather than the wordmark cluster.
 */

const CREDENTIALS = ['Google', 'Databricks', 'Twitter'];

const VALUES = [
  {
    icon: Globe2,
    title: 'World-class engineering',
    body: 'Built to the same bar as the platforms our team came up on — fast, reliable, and secure by default.',
  },
  {
    icon: HeartHandshake,
    title: 'Built for the culture',
    body: 'We go to these events. WhatsApp-friendly sharing, J$ pricing, mobile-first checkout — built for how the islands actually party.',
  },
  {
    icon: Sparkles,
    title: 'Here for the long run',
    body: 'A Caribbean events platform with a global engineering standard, made by people who call it home.',
  },
];

export default function About() {
  return (
    <section
      aria-labelledby="about-heading"
      className="relative isolate overflow-hidden bg-[#faf8f4] text-slate-900"
    >
      <AboutBackground />

      <div className="relative z-10 container mx-auto px-5 sm:px-6 lg:px-8 py-24 sm:py-28 lg:py-32">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Narrative */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500"
            >
              <span className="h-px w-6 bg-slate-300" />
              About TropTix · Made in Jamaica 🇯🇲
            </motion.div>

            <motion.h2
              id="about-heading"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-4 sm:mt-5 text-[2.25rem] leading-[1.05] sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight text-balance"
            >
              Built in the Caribbean,{' '}
              <span className="text-primary">for the Caribbean.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-6 max-w-2xl text-base sm:text-lg text-slate-600 leading-[1.6]"
            >
              From Harvard and engineering teams at Google, Databricks, and
              Twitter &mdash; back home to Kingston. TropTix is built by
              Jamaican engineers who came up through world-class tech and
              brought it to the events we grew up on.
            </motion.p>

            {/* Credentials cluster — kept deliberately quiet */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-9"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Where the team has built
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-3">
                {CREDENTIALS.map((name) => (
                  <span
                    key={name}
                    className="text-lg sm:text-xl font-semibold tracking-tight text-slate-400/90"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Values */}
          <div className="lg:col-span-5">
            <ul className="space-y-4">
              {VALUES.map(({ icon: Icon, title, body }, i) => (
                <motion.li
                  key={title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
                  className="flex gap-4 rounded-2xl bg-white/70 ring-1 ring-slate-900/[0.06] p-5 backdrop-blur"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {title}
                    </p>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                      {body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function AboutBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            // Soft lavender hint upper-left
            'radial-gradient(45% 40% at 8% 6%, hsl(var(--primary) / 0.08), transparent 65%)',
            // Warm sunset hint lower-right — nods to the hero's Caribbean palette
            'radial-gradient(40% 40% at 95% 98%, rgba(244,114,92,0.06), transparent 60%)',
            'linear-gradient(180deg, #faf8f4 0%, #f7f4ec 100%)',
          ].join(', '),
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
          )}")`,
          backgroundSize: '220px 220px',
        }}
      />
    </div>
  );
}
