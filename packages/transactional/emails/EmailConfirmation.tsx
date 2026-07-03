import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Hr,
  Img,
  Link,
  Tailwind,
  pixelBasedPreset,
} from 'react-email';
import { buildCalendarLinks } from '../src/calendar';

export interface EmailTicket {
  id: string;
  total: number | null;
  subtotal: number | null;
  fees: number | null;
  cardLast4?: string | null;
  ticketType: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
  } | null;
}

export interface EmailOrder {
  id: string;
  /** Guest ticket-access token — appended to the tickets link as `?t=`. */
  accessToken?: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  total: number | null;
  subtotal: number | null;
  fees: number | null;
  createdAt: Date | null;
  cardLast4?: string | null;
  event: {
    id: string;
    name: string;
    imageUrl: string | null;
    startDate: Date;
    endDate: Date | null;
    address: string | null;
    description: string | null;
  };
  tickets: EmailTicket[];
}

export default function EmailConfirmationTemplate({
  order,
  baseUrl,
}: {
  order: EmailOrder;
  // Absolute origin for in-email links, supplied by the caller so this template
  // stays environment-agnostic.
  baseUrl: string;
}) {
  const { event, tickets = [] } = order;
  const ticketUrl = `${baseUrl}/orders/${order.id}/tickets${
    order.accessToken ? `?t=${encodeURIComponent(order.accessToken)}` : ''
  }`;
  const calendar = buildCalendarLinks(order, ticketUrl);
  const greetingName = order.firstName || 'Guest';
  const fullName =
    [order.firstName, order.lastName].filter(Boolean).join(' ') || 'Guest';

  return (
    <Html>
      <Head />
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-slate-50 ">
          <Container className="w-full max-w-[480px] mx-auto bg-white font-sans rounded-xl">
            <Section className="bg-indigo-500 w-full text-[1px] leading-[6px]">
              {' '}
            </Section>

            <Section className="text-center pt-5">
              <Link href={baseUrl}>
                <Text className="inline-block mb-3 text-[28px] font-bold text-indigo-500 m-0">
                  TropTix
                </Text>
              </Link>
            </Section>

            <Heading className="text-2xl text-center px-6 pt-4 text-slate-900">
              {greetingName}, you&apos;re confirmed!
            </Heading>

            <Section className="p-6">
              <Text className="text-xl font-semibold text-slate-700 mb-4">
                {event.name}
              </Text>
              {event.imageUrl && (
                <Img
                  src={event.imageUrl}
                  alt={event.name}
                  className="w-full mb-6"
                  style={{ borderRadius: '12px' }}
                />
              )}

              <Button
                href={ticketUrl}
                className="block bg-indigo-500 text-white text-base font-semibold no-underline text-center py-3 px-5 rounded-md w-1/2 mx-auto"
              >
                View Tickets
              </Button>

              <Section className="text-sm text-slate-600 mb-6">
                <DetailRow label="Venue" value={event.address} />
                <DetailRow
                  label="Date & Time"
                  value={
                    <>
                      {formatDate(event.startDate, DATE_TIME)}{' '}
                      {event.endDate
                        ? `– ${formatDate(event.endDate, TIME)}`
                        : ''}
                    </>
                  }
                />
                <DetailRow label="Order Number" value={order.id} />
                <Text className="font-medium mt-3 mb-1 text-slate-500">
                  Add to calendar
                </Text>
                <Text className="m-0">
                  <Link
                    href={calendar.google}
                    style={{ textDecoration: 'underline', color: '#6366f1' }}
                  >
                    Google
                  </Link>
                  <span className="text-slate-300"> &nbsp;·&nbsp; </span>
                  <Link
                    href={calendar.outlook}
                    style={{ textDecoration: 'underline', color: '#6366f1' }}
                  >
                    Outlook
                  </Link>
                </Text>
              </Section>

              {/* TICKET DETAILS */}
              <Section className="mt-6">
                <Text className="text-sm font-bold text-black mb-4">
                  TICKET DETAILS
                </Text>
                <table
                  cellPadding="0"
                  cellSpacing="0"
                  className="w-full border-collapse"
                  style={{ width: '100%', lineHeight: '1.6' }}
                >
                  <tbody>
                    <tr>
                      <td className="text-sm text-slate-500 pr-4 align-top">
                        Name
                      </td>
                      <td className="text-sm text-black font-medium text-right">
                        {fullName}
                      </td>
                    </tr>

                    {groupTicketsByType(tickets).map((group, index) => (
                      <tr key={index}>
                        <td className="text-sm text-slate-900 font-medium pr-4 align-top pt-2">
                          {group.ticketType?.name || 'Ticket'}
                        </td>
                        <td className="text-sm text-slate-900 font-medium text-right pt-2">
                          {group.quantity} ×{' '}
                          {priceOrFree(group.ticketType?.price)}
                        </td>
                      </tr>
                    ))}

                    <tr>
                      <td className="text-sm text-slate-500 pr-4 pt-3">
                        Total price
                      </td>
                      <td className="text-sm text-black font-medium text-right pt-3">
                        {priceOrFree(order.total, 'FREE')}
                      </td>
                    </tr>

                    {!!order.total && order.total > 0 && !!order.cardLast4 && (
                      <tr>
                        <td></td>
                        <td className="text-xs text-slate-500 text-right pt-1">
                          Paid with card ending in ****{order.cardLast4}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Section>
            </Section>

            <Hr className="border-slate-200 my-8" />

            <Text className="text-xs text-center text-slate-400 px-6 pb-6">
              Powered by{' '}
              <Link
                href={baseUrl}
                style={{ textDecoration: 'underline', color: '#6366f1' }}
              >
                TropTix
              </Link>
              .
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <>
      <Text className="font-medium mt-3 mb-1 text-slate-500">{label}</Text>
      <Text className="m-0 text-slate-900">{value}</Text>
    </>
  );
}

function groupTicketsByType(tickets: EmailTicket[]) {
  const map = new Map<
    string,
    { ticketType: EmailTicket['ticketType']; quantity: number }
  >();

  for (const ticket of tickets) {
    const id = ticket.ticketType?.id || 'Unknown';
    const existing = map.get(id);
    if (existing) {
      existing.quantity += 1;
    } else {
      map.set(id, { ticketType: ticket.ticketType, quantity: 1 });
    }
  }

  return Array.from(map.values());
}

function priceOrFree(price: number | null | undefined, freeLabel = 'Free') {
  return price && price > 0 ? `$${price.toFixed(2)}` : freeLabel;
}

const TIME_ZONE = 'America/New_York';

const DATE_TIME = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
} satisfies Intl.DateTimeFormatOptions;

const TIME = {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
} satisfies Intl.DateTimeFormatOptions;

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    ...options,
  }).format(new Date(date));
}

// Mock data for the preview server (`yarn email`); never used in production.
EmailConfirmationTemplate.PreviewProps = {
  order: {
    id: 'TT-2024-001234',
    firstName: 'Emmanuel',
    lastName: 'Sylvester',
    email: 'emmanuel.sylvester@usetroptix.com',
    total: 0,
    subtotal: 0,
    fees: 0,
    cardLast4: '1234',
    createdAt: new Date('2024-03-15'),
    event: {
      id: 'event-123',
      name: 'Caribbean Music Festival 2024',
      imageUrl:
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
      startDate: new Date('2024-03-15T19:00:00'),
      endDate: new Date('2024-03-15T23:00:00'),
      address: "Queen's Park Savannah, Port of Spain",
      description: 'An amazing Caribbean music festival',
    },
    tickets: [
      {
        id: 'ticket-1',
        total: 0,
        subtotal: 0,
        fees: 0,
        ticketType: {
          id: '1',
          name: 'General Admission',
          description: 'Free admission ticket',
          price: 0,
        },
      },
      {
        id: 'ticket-2',
        total: 0,
        subtotal: 0,
        fees: 0,
        ticketType: {
          id: '1',
          name: 'General Admission',
          description: 'Free admission ticket',
          price: 0,
        },
      },
      {
        id: 'ticket-3',
        total: 0,
        subtotal: 0,
        fees: 0,
        ticketType: {
          id: '2',
          name: 'General Admission Paid',
          description: 'Free admission ticket',
          price: 0,
        },
      },
    ],
  },
  baseUrl: 'http://localhost:3000',
} satisfies { order: EmailOrder; baseUrl: string };
