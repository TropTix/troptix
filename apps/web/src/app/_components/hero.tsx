'use client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight } from 'lucide-react';
import CaribbeanFlags from './caribbean-flags';

export default function LandingHero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background/95 to-muted/30 overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-muted/10 via-transparent to-primary/5 pointer-events-none" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Large gradient blurs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-chart-2/5 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Floating bubbles */}
        <motion.div
          className="absolute top-20 left-10 w-4 h-4 bg-primary/20 rounded-full"
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-32 right-20 w-6 h-6 bg-chart-2/15 rounded-full"
          animate={{
            y: [0, -30, 0],
            x: [0, -15, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
        />
        <motion.div
          className="absolute bottom-32 left-20 w-3 h-3 bg-primary/25 rounded-full"
          animate={{
            y: [0, -25, 0],
            x: [0, 20, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/3 w-2 h-2 bg-chart-2/30 rounded-full"
          animate={{
            y: [0, -15, 0],
            x: [0, -10, 0],
            scale: [1, 1.4, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        />
        <motion.div
          className="absolute bottom-20 right-1/3 w-5 h-5 bg-primary/10 rounded-full"
          animate={{
            y: [0, -35, 0],
            x: [0, 25, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 3,
          }}
        />
        <motion.div
          className="absolute top-3/4 right-10 w-3 h-3 bg-chart-2/20 rounded-full"
          animate={{
            y: [0, -20, 0],
            x: [0, -20, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 6.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1.5,
          }}
        />
        <motion.div
          className="absolute top-40 left-1/2 w-4 h-4 bg-primary/15 rounded-full"
          animate={{
            y: [0, -40, 0],
            x: [0, 15, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 8.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2.5,
          }}
        />
        <motion.div
          className="absolute bottom-40 left-1/4 w-2 h-2 bg-chart-2/25 rounded-full"
          animate={{
            y: [0, -30, 0],
            x: [0, -25, 0],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 7.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 4,
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 text-center">
        {/* Beta badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 border border-primary/20 bg-primary/10 text-primary backdrop-blur-sm rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            TropTix is now in Beta Testing!
          </div>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-tight tracking-tight mb-6 text-foreground"
        >
          Unforgettable{' '}
          <motion.span
            className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-chart-2 to-primary inline-block"
            style={{
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundSize: '200% 100%',
            }}
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            experiences
          </motion.span>{' '}
          start here.
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xl md:text-2xl text-muted-foreground mb-6 max-w-3xl mx-auto leading-relaxed"
        >
          Discover events, buy tickets instantly, or create your own.
          <br className="hidden md:block" />
          Make every moment memorable with TropTix.
        </motion.p>

        {/* Caribbean Flags */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mb-8"
        >
          <CaribbeanFlags />
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <CTAButtons />
        </motion.div>
      </div>
    </section>
  );
}

function CTAButtons() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        <Button
          size="lg"
          asChild
          className="w-full sm:w-auto px-8 py-6 text-lg font-semibold bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <Link href="/events" className="flex items-center gap-2">
            Explore Events
            <ArrowRight className="w-5 h-5" />
          </Link>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          size="lg"
          variant="outline"
          asChild
          className="w-full sm:w-auto px-8 py-6 text-lg font-semibold border-2 hover:bg-muted/50 transition-all duration-300"
        >
          <Link href="/organizer/events/new">Create Your First Event</Link>
        </Button>
      </motion.div>
    </div>
  );
}
