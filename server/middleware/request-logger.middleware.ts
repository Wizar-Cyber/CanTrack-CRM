import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

declare global {
  namespace Express {
    interface Request {
      log: ReturnType<typeof logger.child>;
    }
  }
}

/** Attaches a request-scoped logger child with correlation ID to each request */
export function requestLoggerMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.log = logger.child({
    requestId: req.requestId,
    path: req.path,
    method: req.method,
  });
  next();
}
