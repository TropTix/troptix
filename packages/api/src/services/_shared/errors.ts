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

export class PaidTicketingNotEnabledError extends Error {
  constructor(message = 'Paid ticketing is not enabled for this organization') {
    super(message);
    this.name = 'PaidTicketingNotEnabledError';
  }
}
