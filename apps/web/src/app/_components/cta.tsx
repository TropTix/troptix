'use client';

import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  CalculatorIcon,
  Calendar,
  Copy,
  MessageCircle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function CTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-1 gap-12 items-center max-w-6xl mx-auto  text-center ">
          {/* Left Column - CTA Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to create your next event?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join thousands of organizers who trust TropTix to deliver
              exceptional ticketing experiences.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center  mb-8">
              <Link href="/organizer/events/new">
                <Button size="lg" className="group">
                  <Calendar className="mr-2 h-5 w-5" />
                  Create Event
                </Button>
              </Link>
              <Link
                href="https://calendar.app.google/dFkiNqFHyauhMRTFA"
                target="_blank"
              >
                <Button size="lg" className="group">
                  <CalculatorIcon className="mr-2 h-5 w-5" />
                  Book a Demo
                  <ArrowUpRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>

            <div className="flex items-center text-sm text-muted-foreground justify-center ">
              <EmailUsButton />
            </div>
          </motion.div>
          {/* Right Column - Contact Form */}
          {/* <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <ContactForm />
          </motion.div> */}
        </div>
      </div>
    </section>
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
        variant="outline"
        size="sm"
        className="flex items-center space-x-2"
        aria-label="Send an email to TropTix to learn more"
        onClick={handleEmailClick}
      >
        <MessageCircle className="h-4 w-4" />
        <span>Or send us an email</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="flex items-center space-x-1"
        aria-label="Copy TropTix email address"
        onClick={handleCopyEmail}
      >
        <Copy className="h-4 w-4" />
        <span>Copy email</span>
      </Button>
    </div>
  );
}
