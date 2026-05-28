'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  MessageCircle,
  TrendingUp,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export default function CTA() {
  return (
    <section
      aria-labelledby="organizer-heading"
      className="relative isolate overflow-hidden bg-[#f7f4ec] text-slate-900"
    >
      <OrganizerBackground />

      <div className="relative z-10 container mx-auto px-5 sm:px-6 lg:px-8 pt-24 pb-24 sm:pt-28 sm:pb-28 lg:pt-32 lg:pb-36">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <OrganizerCopy />
          <DashboardPreview />
        </div>

        <div className="mt-20 sm:mt-24 flex flex-col items-center gap-2 text-center text-slate-500">
          <p className="text-sm">Questions? We&rsquo;re a message away.</p>
          <EmailUsButton />
        </div>
      </div>
    </section>
  );
}

function OrganizerBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            // Soft lavender hint upper-right
            'radial-gradient(50% 45% at 90% 8%, hsl(var(--primary) / 0.08), transparent 65%)',
            // Warm cream wash, slightly different note from the hero so the section reads as new
            'linear-gradient(180deg, #f9f6ef 0%, #f7f4ec 55%, #f5f1e8 100%)',
          ].join(', '),
        }}
      />
      {/* Faint editorial grain */}
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

function OrganizerCopy() {
  const features = [
    { icon: TrendingUp, label: 'Real-time analytics' },
    { icon: Zap, label: 'Fast check-in' },
    { icon: MessageCircle, label: 'WhatsApp-friendly sharing' },
    { icon: Wifi, label: 'Mobile-first checkout' },
    { icon: Wallet, label: 'Caribbean-focused payouts' },
  ];

  return (
    <div className="lg:col-span-6 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500"
      >
        <span className="h-px w-6 bg-slate-300" />
        Organizer Headquarters
      </motion.div>

      <motion.h2
        id="organizer-heading"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="mt-4 sm:mt-5 text-[2.25rem] leading-[1.05] sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 text-balance"
      >
        Run sold-out <span className="text-primary">Caribbean events</span> like
        a pro.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mt-5 max-w-xl text-base sm:text-lg text-slate-600 leading-[1.55]"
      >
        Real-time sales, frictionless check-in, instant payouts. Built for the
        rhythm of Caribbean nightlife &mdash; from a sunset fete to a 5,000-cap
        carnival.
      </motion.p>

      <motion.ul
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mt-7 flex flex-wrap gap-2"
      >
        {features.map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-slate-900/[0.07] bg-white/70 px-3 py-1 text-xs text-slate-700 backdrop-blur"
          >
            <Icon className="h-3 w-3 text-slate-500" aria-hidden />
            {label}
          </li>
        ))}
      </motion.ul>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-9 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
      >
        <Button
          asChild
          size="lg"
          className="h-12 w-full sm:w-auto px-7 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_28px_-12px_hsl(var(--primary)/0.45)]"
        >
          <Link href="/organizer/events/new" className="inline-flex items-center gap-2">
            Create Your Event
          </Link>
        </Button>

        <Button
          asChild
          size="lg"
          variant="ghost"
          className="h-12 w-full sm:w-auto px-5 text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.04]"
        >
          <Link href="/organizer" className="inline-flex items-center gap-1.5">
            Explore Organizer Tools
            <ArrowUpRight className="h-4 w-4 text-slate-500" aria-hidden />
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="lg:col-span-6 relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8 }}
        className="relative mx-auto w-full max-w-[560px]"
      >
        <div className="rounded-[20px] bg-white ring-1 ring-slate-900/[0.06] shadow-[0_14px_40px_-12px_rgba(15,23,42,0.12),0_2px_8px_-2px_rgba(15,23,42,0.05)] overflow-hidden">
          <DashboardHeader />
          <div className="p-4 sm:p-5 space-y-4">
            <KpiGrid />
            <RevenueChart />
            <ActivityFeed />
          </div>
        </div>

        {/* Payout chip — light surface, premium soft shadow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="absolute -bottom-5 -left-3 sm:-left-6 hidden sm:flex items-center gap-2.5 rounded-2xl bg-white ring-1 ring-slate-900/[0.06] px-3.5 py-2.5 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.15)]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Wallet className="h-4 w-4" aria-hidden />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Payout sent
            </p>
            <p className="text-sm font-semibold text-slate-900 tabular-nums">
              JMD $284,210
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function DashboardHeader() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 sm:px-5 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
          T
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">
            Organizer Dashboard
          </p>
          <p className="text-[11px] text-slate-500">Sunset Fete · Kingston</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    </div>
  );
}

function KpiGrid() {
  const kpis = [
    { label: 'Tickets sold', value: '1,284', delta: '+12%' },
    { label: 'Revenue today', value: '$24.8K', delta: '+18%' },
    { label: 'Active events', value: '7', delta: '2 selling out' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="rounded-xl bg-slate-50 ring-1 ring-slate-900/[0.05] p-3"
        >
          <p className="text-[10px] uppercase tracking-wider text-slate-500 truncate">
            {k.label}
          </p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-slate-900 tabular-nums">
            {k.value}
          </p>
          <p className="text-[10px] text-emerald-600 mt-0.5 truncate">
            {k.delta}
          </p>
        </div>
      ))}
    </div>
  );
}

function RevenueChart() {
  // Static sparkline path; lightweight illustrative chart, not real data.
  const points = [12, 18, 14, 22, 19, 28, 24, 32, 30, 40, 36, 48];
  const width = 480;
  const height = 90;
  const stepX = width / (points.length - 1);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const norm = (v: number) =>
    height - ((v - min) / (max - min || 1)) * (height - 16) - 8;
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${norm(p)}`)
    .join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-900/[0.05] p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Revenue · last 30 days
          </p>
          <p className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
            $312,840
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
          <TrendingUp className="h-3 w-3" aria-hidden />
          +24%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-16 sm:h-20"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="rev-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#rev-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeOpacity="0.85"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ActivityFeed() {
  const rows = [
    {
      icon: CheckCircle2,
      iconClass: 'text-emerald-600 bg-emerald-50',
      title: 'Sunset Fete',
      meta: 'Kingston · Sat 9PM',
      pill: { text: 'Sold Out', class: 'bg-emerald-50 text-emerald-700' },
    },
    {
      icon: Wallet,
      iconClass: 'text-primary bg-primary/10',
      title: 'Carnival Cruise',
      meta: 'Payout · JMD $84,210',
      pill: { text: 'Settled', class: 'bg-slate-100 text-slate-600' },
    },
    {
      icon: ArrowRight,
      iconClass: 'text-sky-600 bg-sky-50',
      title: 'Beach Day Bash',
      meta: '128 tickets remaining',
      pill: { text: 'On sale', class: 'bg-primary/10 text-primary' },
    },
  ];

  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-900/[0.05] divide-y divide-slate-200/70">
      {rows.map((r) => (
        <div key={r.title} className="flex items-center gap-3 px-3.5 py-3">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${r.iconClass}`}
          >
            <r.icon className="h-3.5 w-3.5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">
              {r.title}
            </p>
            <p className="text-[11px] text-slate-500 truncate">{r.meta}</p>
          </div>
          <span
            className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${r.pill.class}`}
          >
            {r.pill.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmailUsButton() {
  const email = 'info@usetroptix.com';

  const handleEmailClick = () => {
    const subject = encodeURIComponent('Inquiry about TropTix');
    const body = encodeURIComponent(
      'Hi TropTix Team,\r\n\r\nI’m interested in learning more about TropTix.\r\n\r\nThanks,\r\n[Your Name]'
    );
    const href = `mailto:${email}?subject=${subject}&body=${body}`;
    window.open(href, '_self');
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email address copied to clipboard');
    } catch {
      toast.error('Could not copy email address');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.04]"
        aria-label="Send an email to TropTix to learn more"
        onClick={handleEmailClick}
      >
        <MessageCircle className="h-4 w-4 mr-2" aria-hidden />
        <span>Email the team</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="text-slate-500 hover:text-slate-900 hover:bg-slate-900/[0.04]"
        aria-label="Copy TropTix email address"
        onClick={handleCopyEmail}
      >
        <Copy className="h-4 w-4 mr-2" aria-hidden />
        <span>Copy email</span>
      </Button>
    </div>
  );
}
