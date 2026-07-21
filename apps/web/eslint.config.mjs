import { defineConfig } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const sonnerRestriction = {
  paths: [
    {
      name: 'sonner',
      message:
        "Import { notify } from '@/lib/notify' instead — every toast is a named catalog method (see the owned-surface rule in that file).",
    },
  ],
};

export default defineConfig([
  {
    extends: [...nextCoreWebVitals],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', sonnerRestriction],
    },
  },
  {
    // The notify catalog and the Toaster own the sonner dependency.
    files: ['src/lib/notify.ts', 'src/components/toaster.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Call sites pending migration to notify.* in PR 2 of the
    // unified-notifications plan — warn (not off) so the debt stays visible.
    files: [
      'src/app/_components/contact-form.tsx',
      'src/app/_components/cta.tsx',
      'src/app/auth/_components/EmailAuthForm.tsx',
      'src/app/auth/_components/GoogleSignInButton.tsx',
      'src/app/orders/*/confirmation/page.tsx',
      'src/app/organizer/events/_components/EventForm.tsx',
      'src/app/organizer/events/*/attendees/_components/AttendeeTable.tsx',
      'src/app/organizer/events/*/tickets/new/_components/CreateTicketTypeForm.tsx',
      'src/components/ui/event-management-nav.tsx',
    ],
    rules: {
      'no-restricted-imports': ['warn', sonnerRestriction],
    },
  },
]);
