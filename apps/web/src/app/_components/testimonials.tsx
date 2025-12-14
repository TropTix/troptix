'use client';
import { motion } from 'motion/react';
import { Star, Users, Calendar, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ContactForm } from './contact-form';

export default function SocialProof() {
  const stats = [
    {
      icon: Users,
      value: '10,000+',
      label: 'Happy Users',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Calendar,
      value: '500+',
      label: 'Events Created',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Star,
      value: '4.9/5',
      label: 'User Rating',
      color: 'from-yellow-500 to-orange-500',
    },
    {
      icon: TrendingUp,
      value: '99.9%',
      label: 'Uptime',
      color: 'from-green-500 to-emerald-500',
    },
  ];

  const testimonials = [
    {
      quote:
        'TropTix made organizing our conference incredibly simple. The interface is intuitive and our attendees loved the seamless ticket experience.',
      author: 'Sarah Chen',
      role: 'Event Director',
      company: 'Tech Summit 2024',
    },
    {
      quote:
        'As an event-goer, I appreciate how fast and secure the ticket purchasing process is. No more complicated checkouts!',
      author: 'Marcus Rodriguez',
      role: 'Frequent Attendee',
      company: 'Music Festivals',
    },
    {
      quote:
        'The analytics and attendee management features helped us understand our audience better and improve our events.',
      author: 'Emily Watson',
      role: 'Marketing Manager',
      company: 'Creative Workshops',
    },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Trusted by thousands worldwide
          </h2>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Join the growing community of event organizers and attendees who
            choose TropTix
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div
                  className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.color} mb-4 shadow-lg`}
                >
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                  {stat.value}
                </div>
                <div className="text-muted-foreground font-medium">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Testimonials */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-20"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-center text-foreground mb-12">
            What our users say
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>
                <blockquote className="text-muted-foreground mb-6 leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
                <div>
                  <div className="font-semibold text-foreground">
                    {testimonial.author}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {testimonial.role} • {testimonial.company}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Contact Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-gradient-to-br from-primary/5 to-chart-2/5 rounded-3xl p-8 md:p-12 border border-primary/10"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Content */}
            <div className="text-center lg:text-left">
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                Have questions? Let&apos;s talk.
              </h3>
              <p className="text-xl text-muted-foreground mb-8">
                Whether you&apos;re planning your first event or looking to
                scale your business, our team is here to help you succeed.
              </p>

              {/* Quick action buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button size="lg" asChild className="px-8 py-3">
                    <Link href="/organizer/events/new">Start Creating</Link>
                  </Button>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="px-8 py-3"
                  >
                    <Link href="/events">Browse Events</Link>
                  </Button>
                </motion.div>
              </div>
            </div>

            {/* Right side - Contact Form */}
            <div className="bg-card/50 backdrop-blur-sm rounded-2xl p-6 border border-border/50">
              <h4 className="text-lg font-semibold text-foreground mb-4 text-center">
                Send us a message
              </h4>
              <ContactForm />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
