'use client';

import { Bricolage_Grotesque } from 'next/font/google';
import Image from 'next/image';

import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { FlyerFrame } from './flyers';

const displayFont = Bricolage_Grotesque({ subsets: ['latin'] });

const FLYER_BUCKET =
  'https://mxcttyliflmqpyweisnh.supabase.co/storage/v1/object/public/event-flyers';

type Story = {
  id: string;
  event: string;
  type: string;
  image: string;
  rotate: number;
  quote?: string;
  note?: string;
};

const STORIES: Story[] = [
  {
    id: 'ondeck',
    event: 'On Deck',
    type: 'Party series',
    image: `${FLYER_BUCKET}/9e2ad5ab-490f-406f-9012-1b4167c8fc3f.jpg`,
    rotate: -3,
    quote: 'We’ve used it three times already, and we plan to use it again.',
    note: 'Three events on TropTix and counting',
  },
  {
    id: 'masters-of-medicine',
    event: 'Masters of Medicine',
    type: 'Medical conference',
    image: `${FLYER_BUCKET}/ee7f455a-c32b-483a-a35c-04fcad730642.jpg`,
    rotate: 2,
  },
  {
    id: 'campion-reunion',
    event: 'Campion College 10-Year Reunion',
    type: 'Class reunion',
    image: `${FLYER_BUCKET}/71313453-5d2b-4e4a-949a-2cf010c83cb4.jpg`,
    rotate: -2,
  },
];

export default function SocialProof() {
  return (
    <section
      aria-labelledby="social-proof-heading"
      className="border-t border-foreground/6 bg-background py-20 sm:py-24"
    >
      <div className="container mx-auto px-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="social-proof-heading"
            className={cn(
              'text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]',
              displayFont.className
            )}
          >
            They keep coming back.
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Real events that ran on TropTix, from organizers who came back to
            run more.
          </p>
        </div>

        <Carousel opts={{ loop: true }} className="mx-auto mt-12 max-w-4xl">
          <CarouselContent>
            {STORIES.map((story) => (
              <CarouselItem key={story.id}>
                <div className="grid items-center gap-8 px-4 py-8 sm:gap-10 md:grid-cols-[auto_1fr] md:px-10">
                  <div
                    className="mx-auto w-44 sm:w-52 md:w-56"
                    style={{ transform: `rotate(${story.rotate}deg)` }}
                  >
                    <FlyerFrame aspect="portrait">
                      <div className="relative h-full w-full">
                        <Image
                          src={story.image}
                          alt={`${story.event} flyer`}
                          fill
                          sizes="(min-width: 768px) 224px, 208px"
                          className="object-cover"
                        />
                      </div>
                    </FlyerFrame>
                  </div>

                  <div className="text-center md:text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                      {story.type}
                    </p>
                    <h3
                      className={cn(
                        'mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl',
                        displayFont.className
                      )}
                    >
                      {story.event}
                    </h3>
                    {story.quote && (
                      <blockquote className="mt-4 text-lg font-medium leading-snug text-foreground sm:text-xl">
                        &ldquo;{story.quote}&rdquo;
                      </blockquote>
                    )}
                    {story.note && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {story.note}
                      </p>
                    )}
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="mt-8 flex justify-center gap-3 md:mt-10">
            <CarouselPrevious className="static translate-x-0 translate-y-0" />
            <CarouselNext className="static translate-x-0 translate-y-0" />
          </div>
        </Carousel>
      </div>
    </section>
  );
}
