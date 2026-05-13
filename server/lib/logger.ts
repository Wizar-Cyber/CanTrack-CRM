/**
 * Structured logger using Pino.
 * Provides request-aware logging with levels and structured metadata.
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.currentPassword', 'body.newPassword'],
    censor: '[REDACTED]',
  },
});

/**
 * Creates a child logger with request context.
 */
export function requestLogger(requestId: string, path: string, method: string) {
  return logger.child({ requestId, path, method });
}
