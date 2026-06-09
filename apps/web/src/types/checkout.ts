import {
  TicketType as PrismaTicketTypeEnum,
  TicketFeeStructure,
} from '@troptix/db';

export enum ValidationResponseMessage {
  SomeTicketsUnavailable = 'Some tickets were unavailable or sold out and cart was adjusted',
  AllTicketsValidated = 'Tickets are available',
  AllTicketInvalid = 'All tickets are unavailable',
  NoTicketsSelected = 'No tickets selected',
  MissingRequiredFields = 'Missing required fields or no tickets selected',
}

export interface ValidationResponse {
  isValid: boolean;
  wasAdjusted: boolean;
  validatedItems: ValidatedItem[];
  subtotal: number;
  fees: number;
  total: number;
  promotionApplied: string | null;
  message: ValidationResponseMessage | null;
  isFree: boolean;
  orderId: string | null;
  clientSecret: string | null;
  expiresAt: string | null;
}

export enum ValidatedItemMessage {
  Available = 'Available',
  QuantityReducedMaxAvailable = 'Quantity Reduced: Max Available',
  SoldOut = 'Sold Out',
  SaleNotStarted = 'Sale Not Started',
  SaleEnded = 'Sale Ended',
  TicketTypeNotFound = 'Ticket Type Not Found',
}

export interface ValidatedItem {
  ticketTypeId: string;
  name: string;
  requestedQuantity: number;
  validatedQuantity: number;
  pricePerTicket: number;
  feesPerTicket: number;
  message: ValidatedItemMessage;
}

export interface CheckoutTicket {
  id: string;
  name: string;
  description: string;
  price: number;
  saleStartDate: string; // ISO String
  saleEndDate: string; // ISO String
  maxAllowedToAdd: number;
  fees: number;
  feeStructure: TicketFeeStructure;
  ticketType: PrismaTicketTypeEnum | null;
  ticketQuanityLow: boolean;
  isPasswordProtected?: boolean;
}

export interface CheckoutConfigResponse {
  tickets: CheckoutTicket[];
  message?: string;
  // Might want to include other relevant information like currency,
  // currency
  // Custom form fields set by the event owner
}

export interface ApplyCodeResponse {
  message: string;
  type: 'password' | 'invalid';
  isValid: boolean;
  unlockedTicket?: CheckoutTicket;
}
