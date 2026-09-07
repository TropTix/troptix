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

export class PaidTicketingNotEnabledError extends Error {
  constructor(message = 'Paid ticketing is not enabled for this organization') {
    super(message);
    this.name = 'PaidTicketingNotEnabledError';
  }
}
