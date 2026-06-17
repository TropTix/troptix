export type TicketType = 'General Admission' | 'VIP' | 'Early Bird' | 'RSVP';

export interface Guest {
  id: string;
  name: string;
  email: string;
  ticketType: TicketType;
  ticketId: string;
  checkedIn: boolean;
  checkedInAt?: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  endDate: string;
  venue: string;
  city: string;
  description: string;
  accentColor: string;
  guests: Guest[];
  ticketsSold?: number;
}

export const STUB_EVENTS: Event[] = [
  {
    id: 'evt-001',
    name: 'Summer Vibes Festival',
    date: '2026-07-15T18:00:00',
    endDate: '2026-07-15T23:59:00',
    venue: 'Bayfront Park Amphitheater',
    city: 'Miami, FL',
    description: 'The biggest outdoor music festival of the summer.',
    accentColor: '#F59E0B',
    ticketsSold: 1240,
    guests: [
      {
        id: 'g01',
        name: 'Jordan Williams',
        email: 'jordan@example.com',
        ticketType: 'VIP',
        ticketId: 'TRP-EVT001-G01',
        checkedIn: true,
        checkedInAt: '2026-07-15T18:12:00',
      },
      {
        id: 'g02',
        name: 'Aaliyah Moss',
        email: 'aaliyah@example.com',
        ticketType: 'General Admission',
        ticketId: 'TRP-EVT001-G02',
        checkedIn: true,
        checkedInAt: '2026-07-15T18:20:00',
      },
    ],
  },
  {
    id: 'evt-new-1',
    name: 'Sunset Yacht Party',
    date: '2026-07-26T16:00:00',
    endDate: '2026-07-26T22:00:00',
    venue: 'Marina Bay Docks',
    city: 'Miami, FL',
    description: 'Exclusive yacht party.',
    accentColor: '#3B82F6',
    ticketsSold: 86,
    guests: [],
  },
  {
    id: 'evt-002',
    name: 'AfroBeats Night',
    date: '2026-08-02T21:00:00',
    endDate: '2026-08-03T03:00:00',
    venue: 'Wynwood Warehouse',
    city: 'Miami, FL',
    description: 'A night of Afrobeats, Amapiano, and good vibes.',
    accentColor: '#10B981',
    ticketsSold: 420,
    guests: [
      {
        id: 'g11',
        name: 'Kofi Asante',
        email: 'kofi@example.com',
        ticketType: 'VIP',
        ticketId: 'TRP-EVT002-G01',
        checkedIn: false,
      },
    ],
  },
  {
    id: 'evt-003',
    name: 'Rooftop Brunch Series',
    date: '2026-08-17T11:00:00',
    endDate: '2026-08-17T16:00:00',
    venue: 'The Arlo Hotel Rooftop',
    city: 'Miami Beach, FL',
    description: 'Bottomless mimosas, live DJs, and skyline views.',
    accentColor: '#EC4899',
    ticketsSold: 132,
    guests: [],
  },
  {
    id: 'evt-new-2',
    name: 'Comedy Night Live',
    date: '2026-08-23T20:00:00',
    endDate: '2026-08-23T23:00:00',
    venue: 'The Improv',
    city: 'Miami, FL',
    description: 'Live comedy night.',
    accentColor: '#8B5CF6',
    ticketsSold: 210,
    guests: [],
  },
  {
    id: 'evt-new-3',
    name: 'Art Basel Preview',
    date: '2026-09-06T19:00:00',
    endDate: '2026-09-06T23:00:00',
    venue: 'Faena Forum',
    city: 'Miami Beach, FL',
    description: 'Preview of art basel galleries.',
    accentColor: '#EF4444',
    ticketsSold: 540,
    guests: [],
  },
];
