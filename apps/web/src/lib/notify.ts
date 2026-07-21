import { toast } from 'sonner';

/**
 * The complete catalog of app toasts. Every user-facing toast is a named
 * method here — import `notify`, never `toast` from 'sonner' (ESLint-enforced).
 *
 * Owned-surface rule: if the outcome is durable page state the user is
 * already looking at, or must act on in place, render it inline (Alert) —
 * never a toast. Toasts are only for transient feedback on actions with no
 * dedicated surface, or actions that navigate away.
 */

const ERROR_DURATION = 8_000;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

const success = (message: string, description?: string) =>
  toast.success(message, { description });

const error = (message: string, description?: string) =>
  toast.error(message, { description, duration: ERROR_DURATION });

export const notify = {
  // Auth
  signedIn: () => success('Signed in!'),
  magicLinkSendFailed: () =>
    error('Could not send your email. Please try again in a moment.'),
  authCodeInvalid: () =>
    error('That code is invalid or expired. Try again or resend it.'),
  googleSignInFailed: () =>
    error('Failed to sign in with Google. Please try again.'),

  // Organizer — events
  eventCreated: () => success('Event created successfully!'),
  eventUpdated: () => success('Event updated successfully!'),
  eventSaveFailed: (detail?: string) => error(detail || GENERIC_ERROR),
  eventPublished: () => success('Event published successfully'),
  eventSetToDraft: () => success('Event set to draft'),
  eventPublishBlocked: (missing: string[], detail?: string) => {
    const title = missing.length
      ? `Missing requirements: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`
      : detail || 'Event cannot be published yet';
    return error(
      title,
      'Please complete all required fields before publishing.'
    );
  },
  eventStatusUpdateFailed: (detail?: string) =>
    error(detail || 'Failed to update event status'),

  // Organizer — ticket types
  ticketTypeCreated: () => success('Ticket created successfully!'),
  ticketTypeUpdated: () => success('Ticket updated successfully!'),
  ticketTypeSaveFailed: (detail?: string) => error(detail || GENERIC_ERROR),

  // Organizer — attendees
  attendeeCheckedIn: () => success('Attendee checked in successfully!'),
  attendeeCheckedOut: () => success('Attendee checked out successfully!'),
  checkInUpdateFailed: (detail?: string) =>
    error(detail || 'Failed to update check-in status'),

  // Contact
  contactMessage: (send: Promise<unknown>) => {
    const id = toast.loading('Sending Message...');
    send
      .then(() => toast.success('Your message has been sent.', { id }))
      .catch(() =>
        toast.error('Failed to send message. Please try again.', {
          id,
          duration: ERROR_DURATION,
        })
      );
  },

  // Misc
  emailCopied: () => success('Email address copied to clipboard'),
  emailCopyFailed: () => error('Could not copy email address'),
};
