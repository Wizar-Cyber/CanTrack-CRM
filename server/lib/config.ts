/**
 * Application configuration.
 * Centralizes all env var access, validation, and the DB pool.
 */

import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;
import { logger } from './logger.js';

// ── Env validation ────────────────────────────────────────────────────────────

function requireEnv(name: string, opts?: { minLength?: number }): string {
  const val = process.env[name];
  if (!val) {
    logger.fatal(`❌ Required env var ${name} is not set`);
    process.exit(1);
  }
  if (opts?.minLength && val.length < opts.minLength) {
    logger.fatal(`❌ ${name} must be at least ${opts.minLength} characters`);
    process.exit(1);
  }
  return val;
}

// ── Exports ────────────────────────────────────────────────────────────────────

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
};

export const jwt = {
  secret: requireEnv('JWT_SECRET', { minLength: 32 }),
  expiresIn: '8h' as const,
  cookieMaxAge: 8 * 60 * 60 * 1000, // 8h, synced with expiresIn
};

export const db = {
  url: requireEnv('DATABASE_URL'),
  pool: new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }),
};

export const auth = {
  bcryptRounds: 12,
  lockoutThreshold: 5,
  lockoutMinutes: 15,
};

export const agent = {
  maxPerHour: parseInt(process.env.AGENT_MAX_PER_HOUR || '8', 10),
  minDelayMs: 2 * 60_000,
  maxDelayMs: 8 * 60_000,
  businessStart: 9,
  businessEnd: 17,
  timezone: 'America/Toronto',
};

export const automation = {
  submitEnabled: process.env.AUTOMATION_SUBMIT_ENABLED === 'true',
};
