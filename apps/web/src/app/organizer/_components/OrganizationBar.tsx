import Link from 'next/link';
import { Check, ChevronDown, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { setActingOrganization } from '../_actions/organizationActions';

type OrganizationOption = { id: string; displayName: string };

export function OrganizationBar({
  organizations,
  currentId,
}: {
  organizations: OrganizationOption[];
  currentId: string | null;
}) {
  const current = organizations.find(
    (organization) => organization.id === currentId
  );

  return (
    <div className="mb-6 flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Organization</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-64 gap-1">
            <span className="truncate">
              {current?.displayName ?? 'Choose organization'}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
          {organizations.map((organization) => (
            <form
              key={organization.id}
              action={setActingOrganization}
              className="contents"
            >
              <input
                type="hidden"
                name="organizationId"
                value={organization.id}
              />
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full cursor-pointer">
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      organization.id === currentId
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <span className="truncate">{organization.displayName}</span>
                </button>
              </DropdownMenuItem>
            </form>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/organizer/organizations/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add organization
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
