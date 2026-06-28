/**
 * Base domain error with HTTP status code.
 * All business-logic errors should extend this class.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Thrown when a requested entity does not exist */
export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super(`${entity} not found.`, 404);
    this.name = 'NotFoundError';
  }
}

/** Thrown when a uniqueness constraint is violated (e.g. duplicate email) */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/** Thrown when authentication is missing or invalid */
export class UnauthorizedError extends DomainError {
  constructor(message = 'Unauthorized.') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

/** Thrown when the authenticated user lacks sufficient permissions */
export class ForbiddenError extends DomainError {
  constructor(message = 'Insufficient permissions.') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}
