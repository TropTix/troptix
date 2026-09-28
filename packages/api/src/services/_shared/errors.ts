export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/** The reservation's Checkout Session is already complete; finalize, never re-mint. */
export class AlreadyPaidError extends Error {
  constructor(reservationId: string) {
    super(`Reservation ${reservationId} has already been paid.`);
    this.name = 'AlreadyPaidError';
  }
}

/** The hold is no longer open for payment (lapsed, released, or already settled). */
export class HoldExpiredError extends Error {
  constructor(reservationId: string) {
    super(`Reservation ${reservationId} is no longer open for payment.`);
    this.name = 'HoldExpiredError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class PayoutSetupIncompleteError extends Error {
  constructor(message = 'Payout setup is not complete for this organization') {
    super(message);
    this.name = 'PayoutSetupIncompleteError';
  }
}

export class InvalidPayoutAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPayoutAmountError';
  }
}

export class PayoutRequestPendingError extends Error {
  constructor(message = 'A payout request is already open') {
    super(message);
    this.name = 'PayoutRequestPendingError';
  }
}

/** The Owner has not accepted the current payout terms. */
export class PayoutTermsNotAcceptedError extends Error {
  constructor(message = 'The current payout terms have not been accepted') {
    super(message);
    this.name = 'PayoutTermsNotAcceptedError';
  }
}

export class PaidTicketingNotEnabledError extends Error {
  constructor(message = 'Paid ticketing is not enabled for this organization') {
    super(message);
    this.name = 'PaidTicketingNotEnabledError';
  }
}

/** The platform balance cannot fund the transfer; the request row is untouched. */
export class InsufficientPlatformBalanceError extends Error {
  constructor(public readonly shortfallCents: number | null) {
    super(
      shortfallCents === null
        ? 'The platform balance cannot cover this payout'
        : `The platform balance is short by ${shortfallCents} cents`
    );
    this.name = 'InsufficientPlatformBalanceError';
  }
}

/** Stripe refuses transfers to the account until the organizer updates their details. */
export class StripeAccountRestrictedError extends Error {
  constructor(message = 'Stripe has paused transfers to this account') {
    super(message);
    this.name = 'StripeAccountRestrictedError';
  }
}
