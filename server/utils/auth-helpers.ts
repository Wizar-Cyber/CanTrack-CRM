import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { jwt as jwtCfg } from '../lib/config.js';

export function signToken(payload: object): string {
  return jwt.sign(payload, jwtCfg.secret, { expiresIn: jwtCfg.expiresIn });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function sanitizeUser(row: any) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
