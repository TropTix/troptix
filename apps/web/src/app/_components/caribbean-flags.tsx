'use client';

import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const caribbeanCountries = [
  { name: 'Jamaica', flag: '🇯🇲' },
  { name: 'Trinidad & Tobago', flag: '🇹🇹' },
  { name: 'Barbados', flag: '🇧🇧' },
  { name: 'Bahamas', flag: '🇧🇸' },
  { name: 'Antigua & Barbuda', flag: '🇦🇬' },
  { name: 'Saint Lucia', flag: '🇱🇨' },
  { name: 'Grenada', flag: '🇬🇩' },
  { name: 'Saint Vincent', flag: '🇻🇨' },
  { name: 'Dominica', flag: '🇩🇲' },
  { name: 'Saint Kitts & Nevis', flag: '🇰🇳' },
  { name: 'Guyana', flag: '🇬🇾' },
  { name: 'Belize', flag: '🇧🇿' },
];

export default function CaribbeanFlags() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % caribbeanCountries.length);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const currentCountry = caribbeanCountries[currentIndex];

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <span>Proudly serving event creators across the Caribbean</span>
      <div className="relative w-8 h-6 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <span
            key={currentIndex}
            className="absolute text-2xl"
            title={currentCountry.name}
          >
            <motion.span
              initial={{ opacity: 0, scale: 0.8, rotateY: -90 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              exit={{ opacity: 0, scale: 0.8, rotateY: 90 }}
              transition={{ duration: 0.5 }}
            >
              {currentCountry.flag}
            </motion.span>
          </span>
        </AnimatePresence>
      </div>
    </div>
  );
}
