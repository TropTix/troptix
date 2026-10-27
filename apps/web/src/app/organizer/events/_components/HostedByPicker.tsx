'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { setActingOrganization } from '../../_actions/organizationActions';
import { CreateOrganizationForm } from '../../_components/CreateOrganizationForm';

const RETURN_TO = '/organizer/events/new';

export function HostedByPicker({
  organizations,
  currentId,
}: {
  organizations: { id: string; displayName: string }[];
  currentId: string | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Change
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Host this event as</DialogTitle>
          <DialogDescription>
            Switching reloads the page, so details you entered are cleared.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <form action={setActingOrganization}>
                <input type="hidden" name="returnTo" value={RETURN_TO} />
                <input
                  type="hidden"
                  name="organizationId"
                  value={organization.id}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  className="w-full justify-start"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      organization.id === currentId
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{organization.displayName}</span>
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <div className="border-t pt-4">
          <CreateOrganizationForm returnTo={RETURN_TO} inline />
        </div>
      </DialogContent>
    </Dialog>
  );
}
