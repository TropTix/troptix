export { default as EmailConfirmationTemplate } from '../emails/EmailConfirmation';
export type { EmailOrder, EmailTicket } from '../emails/EmailConfirmation';
export { buildOrderConfirmation } from './orderConfirmation';
export type {
  EmailContent,
  EmailAttachment,
  BuildOrderConfirmationOptions,
} from './orderConfirmation';
export {
  buildEventIcs,
  buildCalendarLinks,
  calendarFileName,
} from './calendar';
export type { CalendarLinks } from './calendar';
