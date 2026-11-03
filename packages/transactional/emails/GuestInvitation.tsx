import * as React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Hr,
  Tailwind,
  pixelBasedPreset,
} from 'react-email';

/**
 * Everything here comes from the event, the organization and the grant. The
 * organizer writes none of the body, so an invitation cannot carry their text
 * (guest access plan, decision 24).
 */
export interface GuestInvitation {
  eventId: string;
  eventName: string;
  organizationName: string;
  startsAt: Date;
  code: string;
  quantity: number | null;
  expiresAt: Date | null;
}

// The confirmation email's zone, labelled, until events store their own (ADR 0021).
const TIME_ZONE = 'America/New_York';

export function formatInvitationTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date(date));
}

export function invitationLink(invite: GuestInvitation, baseUrl: string) {
  const url = new URL(`/e/${invite.eventId}`, baseUrl);
  url.searchParams.set('code', invite.code);
  return url.toString();
}

export default function GuestInvitationTemplate({
  invite,
  baseUrl,
}: {
  invite: GuestInvitation;
  baseUrl: string;
}) {
  const link = invitationLink(invite, baseUrl);
  return (
    <Html>
      <Head />
      <Preview>
        {`${invite.organizationName} invited you to ${invite.eventName}`}
      </Preview>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="bg-slate-50">
          <Container className="mx-auto w-full max-w-[480px] rounded-xl bg-white font-sans">
            <Section className="w-full bg-indigo-500 text-[1px] leading-[6px]">
              {' '}
            </Section>
            <Section className="px-8 pt-8">
              <Text className="m-0 text-sm text-slate-500">
                {invite.organizationName} invited you to
              </Text>
              <Heading className="mt-1 mb-2 text-2xl font-bold text-slate-900">
                {invite.eventName}
              </Heading>
              <Text className="m-0 text-base text-slate-700">
                {formatInvitationTime(invite.startsAt)}
              </Text>
            </Section>

            <Section className="px-8 pt-6">
              <Button
                href={link}
                className="block rounded-lg bg-indigo-500 px-5 py-3 text-center text-base font-semibold text-white"
              >
                Get your tickets
              </Button>
              <Text className="mt-4 mb-0 text-sm text-slate-500">
                Or enter this code on the event page:
              </Text>
              <Text className="mt-1 mb-0 font-mono text-xl font-bold tracking-widest text-slate-900">
                {invite.code}
              </Text>
            </Section>

            <Section className="px-8 pt-4">
              {invite.quantity !== null && (
                <Text className="my-1 text-sm text-slate-700">
                  You can get up to {invite.quantity}{' '}
                  {invite.quantity === 1 ? 'ticket' : 'tickets'}.
                </Text>
              )}
              {invite.expiresAt && (
                <Text className="my-1 text-sm text-slate-700">
                  This invitation expires{' '}
                  {formatInvitationTime(invite.expiresAt)}.
                </Text>
              )}
            </Section>

            <Section className="px-8 pb-8">
              <Hr className="mt-6 border-slate-200" />
              <Text className="m-0 text-xs text-slate-400">
                This code is for you. Reply to this email to reach{' '}
                {invite.organizationName}. Sent by TropTix on their behalf.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

GuestInvitationTemplate.PreviewProps = {
  invite: {
    eventId: 'event-123',
    eventName: 'Hearts of Legend Gala',
    organizationName: 'Hearts Foundation',
    startsAt: new Date('2027-01-16T19:00:00-05:00'),
    code: 'K7QM4TPZ',
    quantity: 2,
    expiresAt: new Date('2027-01-05T23:59:00-05:00'),
  },
  baseUrl: 'https://usetroptix.com',
};
