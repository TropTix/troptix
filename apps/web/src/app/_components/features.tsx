'use client';
import { motion } from 'motion/react';
import { Calendar, Ticket, Users, BarChart3, Zap, Shield } from 'lucide-react';

export default function Features() {
  const features = [
    {
      title: 'Instant Discovery',
      description:
        'Find events you love with smart recommendations and powerful search.',
      icon: Zap,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Quick Ticketing',
      description:
        'Buy tickets in seconds with our streamlined checkout process.',
      icon: Ticket,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Event Creation',
      description:
        'Create and manage events with our intuitive organizer tools.',
      icon: Calendar,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Attendee Management',
      description: 'Track registrations and manage your audience effortlessly.',
      icon: Users,
      color: 'from-orange-500 to-red-500',
    },
    {
      title: 'Real-time Analytics',
      description:
        'Get insights into your event performance and audience engagement.',
      icon: BarChart3,
      color: 'from-indigo-500 to-purple-500',
    },
    {
      title: 'Secure Payments',
      description:
        'Safe and secure transactions with industry-leading protection.',
      icon: Shield,
      color: 'from-teal-500 to-green-500',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <section className="py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          // className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything you need for amazing events
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            From discovery to creation, we&apos;ve got you covered with powerful
            tools that make events simple and memorable.
          </p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          // className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => (
            <FeatureTile
              key={feature.title}
              feature={feature}
              index={index}
              variants={itemVariants}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeatureTile({ feature, index, variants }) {
  const Icon = feature.icon;

  return (
    <motion.div
      variants={variants}
      whileHover={{
        scale: 1.05,
        transition: { type: 'spring', stiffness: 300, damping: 20 },
      }}
      // className="group relative p-8 bg-card rounded-2xl border border-border hover:border-primary/20 transition-all duration-300 hover:shadow-xl"
    >
      {/* Gradient background on hover */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300`}
      />

      {/* Icon */}
      <div
        className={`relative w-12 h-12 mb-6 rounded-xl bg-gradient-to-br ${feature.color} p-3 shadow-lg`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>

      {/* Content */}
      <div className="relative">
        <h3 className="text-xl font-semibold text-foreground mb-3 group-hover:text-primary transition-colors">
          {feature.title}
        </h3>
        <p className="text-muted-foreground leading-relaxed">
          {feature.description}
        </p>
      </div>
    </motion.div>
  );
}
