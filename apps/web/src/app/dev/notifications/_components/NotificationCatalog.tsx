'use client';

import { Button } from '@/components/ui/button';
import { notify } from '@/lib/notify';

const wait = (ms: number, fail = false) =>
  new Promise((resolve, reject) => setTimeout(fail ? reject : resolve, ms));

const groups: { title: string; entries: [string, () => unknown][] }[] = [
  {
    title: 'Auth',
    entries: [
      ['signedIn', () => notify.signedIn()],
      ['magicLinkSendFailed', () => notify.magicLinkSendFailed()],
      ['authCodeInvalid', () => notify.authCodeInvalid()],
      ['googleSignInFailed', () => notify.googleSignInFailed()],
    ],
  },
  {
    title: 'Organizer — events',
    entries: [
      ['eventCreated', () => notify.eventCreated()],
      ['eventUpdated', () => notify.eventUpdated()],
      ['eventSaveFailed (generic)', () => notify.eventSaveFailed()],
      [
        'eventSaveFailed (server detail)',
        () => notify.eventSaveFailed('An event with this name already exists.'),
      ],
      ['eventPublished', () => notify.eventPublished()],
      ['eventSetToDraft', () => notify.eventSetToDraft()],
      [
        'eventPublishBlocked',
        () => notify.eventPublishBlocked(['name', 'venue', 'date', 'capacity']),
      ],
      ['eventStatusUpdateFailed', () => notify.eventStatusUpdateFailed()],
    ],
  },
  {
    title: 'Organizer — ticket types',
    entries: [
      ['ticketTypeCreated', () => notify.ticketTypeCreated()],
      ['ticketTypeUpdated', () => notify.ticketTypeUpdated()],
      ['ticketTypeSaveFailed', () => notify.ticketTypeSaveFailed()],
    ],
  },
  {
    title: 'Organizer — attendees',
    entries: [
      ['attendeeCheckedIn', () => notify.attendeeCheckedIn()],
      ['attendeeCheckedOut', () => notify.attendeeCheckedOut()],
      ['checkInUpdateFailed', () => notify.checkInUpdateFailed()],
    ],
  },
  {
    title: 'Contact',
    entries: [
      ['contactMessage (succeeds)', () => notify.contactMessage(wait(2000))],
      ['contactMessage (fails)', () => notify.contactMessage(wait(2000, true))],
    ],
  },
  {
    title: 'Misc',
    entries: [
      ['emailCopied', () => notify.emailCopied()],
      ['emailCopyFailed', () => notify.emailCopyFailed()],
    ],
  },
];

export default function NotificationCatalog() {
  return (
    <main className="md:container px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Notification catalog
        </h1>
        <p className="text-sm text-muted-foreground">
          Every toast the app can show, with its real copy. Dev-only page.
        </p>
      </div>

      {groups.map(({ title, entries }) => (
        <section key={title} className="space-y-3">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          <div className="flex flex-wrap gap-2">
            {entries.map(([label, fire]) => (
              <Button key={label} variant="outline" onClick={() => fire()}>
                {label}
              </Button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
