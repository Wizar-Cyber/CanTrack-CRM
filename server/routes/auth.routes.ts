import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { validatePassword, getPasswordPolicyDescription } from '../utils/passwordPolicy.js';
import { setupSchema, createUserSchema, changePasswordSchema, loginSchema, updateProfileSchema } from '../lib/validation.js';

const ACCOUNT_LOCKOUT_THRESHOLD = 5;  // failed attempts before lockout
const ACCOUNT_LOCKOUT_MINUTES = 15;   // lockout duration in minutes

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours – synced with JWT_EXPIRES_IN
};

const JWT_EXPIRES_IN = '8h';

interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'editor' | 'viewer';
  is_active: boolean;
  created_at: string;
  password_hash: string;
  failed_login_attempts?: number;
  locked_until?: Date | null;
}

function sanitizeUser(row: UserRow) {
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

function signToken(payload: object): string {
  const secret = process.env.JWT_SECRET!;
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Setup limit reached.' },
});

export function createAuthRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);
  const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];

  // ── Account Lockout Helpers ──────────────────────────────────────────────────

  async function checkAccountLockout(email: string): Promise<string | null> {
    const result = await pool.query<UserRow>(
      `SELECT failed_login_attempts, locked_until FROM users WHERE email = $1 AND is_active = true`,
      [email.toLowerCase().trim()],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000);
      return `Account temporarily locked. Try again in ${remaining} minutes.`;
    }

    // If lockout period has passed, reset
    if (row.locked_until && new Date(row.locked_until) <= new Date()) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = $1`,
        [email.toLowerCase().trim()],
      );
    }

    return null;
  }

  async function recordFailedAttempt(email: string): Promise<void> {
    await pool.query(
      `UPDATE users SET
        failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        locked_until = CASE
          WHEN COALESCE(failed_login_attempts, 0) + 1 >= $2
          THEN NOW() + ($3 || ' minutes')::INTERVAL
          ELSE locked_until
        END
      WHERE email = $1 AND is_active = true`,
      [email.toLowerCase().trim(), ACCOUNT_LOCKOUT_THRESHOLD, ACCOUNT_LOCKOUT_MINUTES],
    );
  }

  async function resetFailedAttempts(email: string): Promise<void> {
    await pool.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = $1`,
      [email.toLowerCase().trim()],
    );
  }

  // POST /api/auth/setup — Create first admin (only if no users exist)
  router.post('/setup', setupLimiter, async (req, res: Response) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || 'Validation error.';
      return res.status(400).json({ error: firstError });
    }
    const { email, password, firstName, lastName } = parsed.data;

    try {
      const existing = await pool.query('SELECT id FROM users LIMIT 1');
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'A user already exists. Use login.' });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim()],
      );
      const user = sanitizeUser(result.rows[0]);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      console.log(`✅ Initial admin created: ${email}`);
      res.cookie('auth_token', token, COOKIE_OPTS);
      return res.status(201).json({ user });
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23505') return res.status(409).json({ error: 'Email already registered.' });
      console.error('[Setup Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // POST /api/auth/login
  router.post('/login', authLimiter, async (req, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || 'Validation error.';
      return res.status(400).json({ error: firstError });
    }
    const { email, password } = parsed.data;

    try {
      // Check account lockout
      const lockoutMsg = await checkAccountLockout(email);
      if (lockoutMsg) return res.status(429).json({ error: lockoutMsg });

      const result = await pool.query<UserRow>(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()],
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: 'Invalid credentials.' });

      const row = result.rows[0];
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) {
        await recordFailedAttempt(email);
        console.log(`[Audit] Failed login attempt for: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials.' });
      }

      // Successful login — reset failed attempts
      await resetFailedAttempts(email);
      console.log(`[Audit] Successful login: ${email}`);

      const user = sanitizeUser(row);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      res.cookie('auth_token', token, COOKIE_OPTS);
      return res.json({ user });
    } catch (error) {
      console.error('[Login Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // POST /api/auth/logout
  router.post('/logout', (_, res: Response) => {
    res.clearCookie('auth_token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    return res.json({ success: true });
  });

  // GET /api/auth/me
  router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query<UserRow>(
        'SELECT * FROM users WHERE id = $1 AND is_active = true',
        [req.user!.id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Me Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // PATCH /api/auth/profile
  router.patch('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
    try {
      const result = await pool.query<UserRow>(
        'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [firstName.trim(), lastName.trim(), req.user!.id],
      );
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Profile Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // PATCH /api/auth/password
  router.patch('/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || 'Validation error.';
      return res.status(400).json({ error: firstError });
    }
    const { currentPassword, newPassword } = parsed.data;

    try {
      const result = await pool.query<UserRow>(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user!.id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.id]);
      console.log(`[Audit] Password changed for user: ${req.user!.id}`);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Password Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // GET /api/auth/password-policy
  router.get('/password-policy', (_req, res: Response) => {
    res.json({ policy: getPasswordPolicyDescription() });
  });

  // ── User management (admin only) ────────────────────────────────────────────

  // GET /api/users
  router.get('/users', requireAuth, requireRole('admin'), async (_req, res: Response) => {
    try {
      const result = await pool.query<UserRow>(
        'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at ASC',
      );
      return res.json(result.rows.map(sanitizeUser));
    } catch (error) {
      console.error('[Users List Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // POST /api/users
  router.post('/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message || 'Validation error.';
      return res.status(400).json({ error: firstError });
    }
    const { email, password, firstName, lastName, role } = parsed.data;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim(), role],
      );
      console.log(`[Audit] User created by ${req.user!.id}: ${email} (${role})`);
      return res.status(201).json(sanitizeUser(result.rows[0]));
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23505') return res.status(409).json({ error: 'Email already registered.' });
      console.error('[Create User Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // PATCH /api/users/:id/role
  router.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;
    if (id === req.user!.id) return res.status(400).json({ error: 'You cannot change your own role.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    try {
      const result = await pool.query<UserRow>(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [role, id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      console.log(`[Audit] Role changed by ${req.user!.id}: user ${id} → ${role}`);
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Update Role Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // DELETE /api/users/:id — soft-delete
  router.delete('/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    if (id === req.user!.id) return res.status(400).json({ error: 'You cannot delete your own account.' });
    try {
      const result = await pool.query(
        'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
      console.log(`[Audit] User deactivated by ${req.user!.id}: ${id}`);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Delete User Error]:', error);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  });

  return router;
}
