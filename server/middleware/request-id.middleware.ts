/**
 * Request ID middleware.
 * Attaches a unique UUID to every request for tracing through logs.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Attaches a unique UUID to every request for log correlation and tracing */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  next();
}
