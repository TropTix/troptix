/**
 * Transport-agnostic service errors. Services throw these; each adapter maps
 * them to its own status code (the REST routes → HTTP, the tRPC adapter → a
 * `TRPCError` in PR 2c). Keeping them here means a service never imports a
 * transport just to signal "not found".
 *
 * Convention — throw vs. return: **throw** a service error when something
 * exceptional happened (a resource the caller named by id doesn't exist, the
 * operation can't proceed). **Return a discriminated result** instead when a
 * "failure" is a normal, expected outcome of valid input — e.g. `applyCode`
 * returns `{ type: 'invalid' }` for a wrong code rather than throwing.
 */

/** A referenced resource (event, ticket type, …) does not exist. → HTTP 404. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * The actor may not perform this operation — no user session, or not the owner
 * of the resource. → HTTP 401/403; the tRPC adapter maps it to `UNAUTHORIZED`.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
