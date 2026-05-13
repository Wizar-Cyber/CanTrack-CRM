/**
 * Rate limiting configuration and presets.
 * Centralizes all rate limit definitions for consistency.
 */

import rateLimit from 'express-rate-limit';

/** Login: 10 req / 15 min */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Password change: 5 req / 15 min */
export const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password change attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Setup: 3 req / hour */
export const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Setup limit reached.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API: 60 req / min */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Heavy operations: 10 req / hour */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Heavy operation limit reached.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Agent: 120 req / min */
export const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many agent requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});
