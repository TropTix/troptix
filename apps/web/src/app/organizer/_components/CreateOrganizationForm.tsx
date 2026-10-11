import { createOrganizationAction } from '../_actions/organizationActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CreateOrganizationForm({
  returnTo,
  inline,
}: {
  returnTo?: string;
  inline?: boolean;
}) {
  return (
    <form
      action={createOrganizationAction}
      className={inline ? 'flex gap-2' : 'space-y-4'}
    >
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {inline ? (
        <Input
          name="displayName"
          required
          maxLength={100}
          placeholder="New organization name"
          aria-label="New organization name"
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" name="displayName" required maxLength={100} />
        </div>
      )}
      <Button type="submit">{inline ? 'Add' : 'Create organization'}</Button>
    </form>
  );
}
