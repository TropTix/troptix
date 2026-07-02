import { defineConfig } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  {
    extends: [...nextCoreWebVitals],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'sonner',
              message:
                "Import { notify } from '@/lib/notify' instead — every toast is a named catalog method (see the owned-surface rule in that file).",
            },
          ],
        },
      ],
    },
  },
  {
    // The notify catalog and the Toaster own the sonner dependency; the
    // legacy /events tree is exempt until it is deleted (see
    // docs/plans/2026-07-unified-notifications.md).
    files: [
      'src/lib/notify.ts',
      'src/components/toaster.tsx',
      'src/app/events/**',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Temporary: call sites pending migration to notify.* — this block is
    // deleted in PR 2 of the unified-notifications plan.
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
      'src/hooks/useCheckout.tsx',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]);
