import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * Returns a requireAuth middleware bound to the given pool so it can verify
 * that the user is still active in the database on every request.
 */
export function createRequireAuth(pool: Pool) {
  return async function requireAuth(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set.' });
      return;
    }

    // Support both httpOnly cookie and Bearer header (cookie takes precedence)
    const tokenFromCookie = (req.cookies as Record<string, string>)?.auth_token;
    const authHeader = req.headers.authorization;
    const tokenFromHeader =
      authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    const token = tokenFromCookie ?? tokenFromHeader;
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      res.status(401).json({ error: 'Token inválido o expirado.' });
      return;
    }

    // Verify the user is still active in the database
    try {
      const result = await pool.query(
        'SELECT is_active FROM users WHERE id = $1',
        [payload.id],
      );
      if (!result.rows[0]?.is_active) {
        res.status(401).json({ error: 'Cuenta desactivada.' });
        return;
      }
    } catch {
      res.status(500).json({ error: 'Error verificando sesión.' });
      return;
    }

    req.user = payload;
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permisos insuficientes.' });
      return;
    }
    next();
  };
}
