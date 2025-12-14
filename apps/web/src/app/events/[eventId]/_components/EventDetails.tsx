'use client';

import { ButtonWithIcon } from '@/components/ui/button';
import {
  DividerWithText,
  TypographyH1,
  TypographyH4,
  TypographyP,
} from '@/components/ui/typography';
import { useScreenSize } from '@/hooks/useScreenSize';
import TicketDrawer from './ticket-drawer';
import TicketModal from './ticket-modal';

import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, MapPin, Ticket } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  trackEmailEventPageView,
  trackEmailTicketPurchaseStart,
} from '@/lib/emailTracking';
import { EventById } from '../page';

export default function EventDetail({ event }: { event: EventById }) {
  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const { isMobile } = useScreenSize();
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const isDraft = event.isDraft;
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!searchParams) return;

    const utmSource = searchParams.get('utm_source');
    const utmMedium = searchParams.get('utm_medium');
    const utmCampaign = searchParams.get('utm_campaign');
    const utmContent = searchParams.get('utm_content');

    if (utmSource === 'email' && utmMedium && utmCampaign && utmContent) {
      trackEmailEventPageView(
        {
          event_id: event.id,
          event_name: event.name,
          organizer: event.organizer,
        },
        {
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
        }
      );
    }
  }, [searchParams, event.id, event.name, event.organizer]);

  function closeModal() {
    setIsTicketModalOpen(false);
  }

  function openModal() {
    setIsTicketModalOpen(true);

    trackEmailTicketPurchaseStart({
      event_id: event.id,
      event_name: event.name,
      organizer: event.organizer,
    });
  }
  const displayImageUrl =
    event.imageUrl ?? 'https://placehold.co/400x400?text=Add+Event+Flyer';

  const displayPrice =
    event.ticketTypes && event.ticketTypes.length > 0
      ? 'From ' + getFormattedCurrency(event.ticketTypes[0].price) + ' USD'
      : 'No tickets available';

  return (
    <>
      {isDraft && (
        <Banner
          title="Draft Mode: Event Not Published"
          message="This event is currently a draft. Only you, as the organizer, can view it. Make any changes you need, then publish when you're ready to go live."
          type="warning"
        />
      )}
      <div
        style={{
          // backgroundColor: '#455A64',
          backgroundImage: `url("${displayImageUrl}")`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          WebkitBackgroundSize: 'cover',
        }}
      >
        {isMobile ? (
          <TicketDrawer
            event={event}
            isTicketModalOpen={isTicketModalOpen}
            onClose={closeModal}
          />
        ) : (
          <TicketModal
            event={event}
            isTicketModalOpen={isTicketModalOpen}
            onClose={closeModal}
          />
        )}
        <div className="w-full md:min-h-screen flex backdrop-blur-3xl">
          <div className={`max-w-5xl mx-auto p-4 sm:p-8`}>
            <div className="md:flex">
              <aside className="md:sticky md:top-0 mb-8 ">
                <Image
                  height={500}
                  width={500}
                  style={{
                    maxHeight: 350,
                    maxWidth: 350,
                    objectFit: 'fill',
                  }}
                  src={
                    event.imageUrl ??
                    'https://placehold.co/600x600.png?text=Add+Event+Flyer'
                  }
                  alt={event.name}
                  className="mb-8 max-h-full flex-shrink-0 self-center object-fill overflow-hidden rounded-lg mx-auto"
                />
                <ButtonWithIcon
                  text={'Buy Tickets'}
                  icon={<Ticket className="mr-2 h-4 w-4" />}
                  onClick={openModal}
                  className={'w-full px-6 py-6 text-base'}
                />
              </aside>
              <div className="w-full md:mx-8 md:p-6 p-4 bg-gray-800 bg-opacity-80 rounded-lg ">
                <div className="mb-4">
                  <TypographyH1 text={event.name} classes="mb-4 text-white" />
                  <div className="flex items-center mb-2">
                    <div className="mr-4">
                      <div className="border border-white rounded border-spacing-1 w-min my-auto">
                        <Calendar className="m-2 w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <TypographyH4
                        text={getDateRangeFormatter(
                          new Date(event.startDate),
                          new Date(event.endDate)
                        )}
                        classes="text-white"
                      />
                      <TypographyP
                        text={getTimeRangeFormatter(
                          new Date(event.startDate),
                          new Date(event.endDate)
                        )}
                        classes="text-white"
                      />
                    </div>
                  </div>
                  <div className="flex items-center mb-2">
                    <div className="mr-4">
                      <div className="border border-white rounded border-spacing-1 w-min my-auto">
                        <MapPin className="m-2 w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <TypographyH4 text={event.venue} classes="text-white" />
                      <TypographyP text={event.address} classes="text-white" />
                    </div>
                  </div>
                  <div className="flex items-center mb-2">
                    <div className="mr-4">
                      <div className="border border-white rounded border-spacing-1 w-min my-auto">
                        <DollarSign className="m-2 w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div>
                      <TypographyH4 text={'Tickets'} classes="text-white" />
                      <TypographyP text={displayPrice} classes="text-white" />
                    </div>
                  </div>

                  <div className="text-xl font-extrabold text-white">
                    by {event.organizer}
                  </div>
                </div>

                <div>
                  <DividerWithText
                    text={'Event Details'}
                    classes="text-white"
                  />
                  <p
                    style={{ whiteSpace: 'pre-line' }}
                    className={`mt-2 text-justify text-base text-white ${
                      !isDescriptionExpanded ? 'line-clamp-4' : ''
                    }`}
                  >
                    {event.description}
                  </p>
                  {event.description && (
                    <Button
                      variant="link"
                      className="text-blue-500 p-0 h-auto mt-1"
                      onClick={() =>
                        setIsDescriptionExpanded(!isDescriptionExpanded)
                      }
                    >
                      {isDescriptionExpanded
                        ? 'Show less details'
                        : 'Read full description'}
                    </Button>
                  )}
                </div>

                <div>
                  <DividerWithText text={'Venue'} classes="text-white" />
                  <TypographyH4 text={event.venue} classes="text-white" />
                  <TypographyP text={event.address} classes="text-white" />
                  <APIProvider apiKey={googleMapsKey!}>
                    <Map
                      className="mt-4 w-full h-60"
                      defaultCenter={{
                        lat: event.latitude ?? 0,
                        lng: event.longitude ?? 0,
                      }}
                      defaultZoom={15}
                      gestureHandling={'none'}
                      disableDefaultUI={true}
                    >
                      <Marker
                        position={{
                          lat: event.latitude ?? 0,
                          lng: event.longitude ?? 0,
                        }}
                      />
                    </Map>
                  </APIProvider>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
