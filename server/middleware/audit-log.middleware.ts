/**
 * Audit log middleware.
 * Logs authentication-relevant requests for security monitoring.
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function auditLogMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/users')) {
    const userId = (req as AuthRequest).user?.id ?? 'anonymous';
    const requestId = req.requestId ?? '-';
    console.log(`[Audit] requestId=${requestId} userId=${userId} ${req.method} ${req.path}`);
  }
  next();
}
