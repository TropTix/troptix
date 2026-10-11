import { CreateOrganizationForm } from '../../_components/CreateOrganizationForm';

export const metadata = { title: 'Create organization' };

export default function NewOrganizationPage() {
  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold">Create an organization</h1>
      <p className="mb-6 text-muted-foreground">
        An organization runs its own events and settings. You can switch between
        your organizations from the dashboard.
      </p>
      <CreateOrganizationForm />
    </div>
  );
}
