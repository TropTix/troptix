'use client';

import { usePathname } from 'next/navigation';
import { CreateOrganizationForm } from './CreateOrganizationForm';

const EVENT_NEW_PATH = '/organizer/events/new';

export function OrganizationRequired() {
  const creatingEvent = usePathname() === EVENT_NEW_PATH;

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold">Create your organization</h1>
      <p className="mb-6 text-muted-foreground">
        {creatingEvent
          ? 'Every event belongs to an organization, so you need one before you can create an event. Create it now and we will bring you back to your new event.'
          : 'An organization runs your events and settings. Create one to open your dashboard.'}
      </p>
      <CreateOrganizationForm
        returnTo={creatingEvent ? EVENT_NEW_PATH : undefined}
      />
    </div>
  );
}
