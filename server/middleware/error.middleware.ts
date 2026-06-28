import { Request, Response, NextFunction } from 'express';
import { DatabaseError } from 'pg';
import { DomainError } from '../domain/shared/DomainError.js';
import { logger } from '../lib/logger.js';

/**
 * Global Express error handler.
 * Handles DomainError with appropriate status codes and logs unexpected errors.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const log = req.requestId
    ? logger.child({ requestId: req.requestId, path: req.path, method: req.method })
    : logger;

  if (err instanceof DomainError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof DatabaseError) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Duplicate resource.' });
      return;
    }
    if (err.code === '23503') {
      res.status(409).json({ error: 'Invalid reference or resource has dependencies.' });
      return;
    }
  }

  log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error.' });
}
