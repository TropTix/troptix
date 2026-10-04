import { createOrganizationAction } from '../../_actions/organizationActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const metadata = { title: 'Create organization' };

export default function NewOrganizationPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold">Create an organization</h1>
      <p className="mb-6 text-muted-foreground">
        An organization runs its own events and settings. You can switch between
        your organizations from the dashboard.
      </p>
      <form action={createOrganizationAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" required maxLength={100} />
        </div>
        <Button type="submit">Create organization</Button>
      </form>
    </div>
  );
}
