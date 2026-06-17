export { default as EmailConfirmationTemplate } from '../emails/EmailConfirmation';
export type { EmailOrder, EmailTicket } from '../emails/EmailConfirmation';
export { buildOrderConfirmation } from './orderConfirmation';
export type {
  EmailContent,
  BuildOrderConfirmationOptions,
} from './orderConfirmation';
