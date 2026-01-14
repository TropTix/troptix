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
} from '@react-email/components';

interface EmailTicket {
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

interface EmailOrder {
  id: string;
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

export default function ComplementaryTicketEmail({
  order = {
    id: 'TT-2024-001234',
    firstName: null,
    lastName: null,
    email: 'guest@example.com',
    total: 0,
    subtotal: 0,
    fees: 0,
    cardLast4: null,
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
          name: 'VIP Pass',
          description: 'Complimentary VIP access',
          price: 0,
        },
      },
    ],
  },
}: {
  order: EmailOrder;
}) {
  const { event, tickets = [] } = order;
  const baseUrl =
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://usetroptix.com';
  const ticketUrl = `${baseUrl}/orders/${order.id}/tickets?utm_source=complementary_email&utm_medium=email&utm_campaign=complementary_tickets`;
  const ticketGroups = groupTicketsByType(tickets);

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
              You&apos;ve received complimentary tickets!
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
                View Your Tickets
              </Button>

              <Section className="text-sm text-slate-600 mb-6">
                {event.address && (
                  <>
                    <Text className="font-medium mt-3 mb-1 text-slate-500">
                      Venue
                    </Text>
                    <Text className="m-0 text-slate-900">{event.address}</Text>
                  </>
                )}
                <Text className="font-medium mt-3 mb-1 text-slate-500">
                  Date & Time
                </Text>
                <Text className="m-0 text-slate-900">
                  {formatDateTime(event.startDate)}{' '}
                  {event.endDate ? `– ${formatTime(event.endDate)}` : ''}
                </Text>
                <Text className="font-medium mt-3 mb-1 text-slate-500">
                  Order Number
                </Text>
                <Text className="m-0 text-slate-900">{order.id}</Text>
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
                    {ticketGroups.map((group, index) => (
                      <tr key={index}>
                        <td className="text-sm text-slate-900 font-medium pr-4 align-top pt-2">
                          {group.ticketType?.name || 'Ticket'}
                        </td>
                        <td className="text-sm text-slate-900 font-medium text-right pt-2">
                          {group.quantity} ticket{group.quantity > 1 ? 's' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section className="mt-6 p-4 bg-indigo-50 rounded-lg">
                <Text className="text-sm text-slate-600 m-0 text-center">
                  These tickets were gifted to you by the event organizer
                </Text>
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

// Helper Functions

function groupTicketsByType(tickets: EmailTicket[]) {
  const map = new Map<
    string,
    { ticketType: EmailTicket['ticketType']; quantity: number }
  >();

  for (const ticket of tickets) {
    const id = ticket.ticketType?.id || 'Unknown';
    if (!map.has(id)) {
      map.set(id, { ticketType: ticket.ticketType, quantity: 1 });
    } else {
      map.get(id)!.quantity += 1;
    }
  }

  return Array.from(map.values());
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}
