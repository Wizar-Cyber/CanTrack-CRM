import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
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
  message: { error: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Límite de configuración alcanzado.' },
});

export function createAuthRouter(pool: Pool) {
  const router = Router();
  const requireAuth = createRequireAuth(pool);
  const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];

  // POST /api/auth/setup — Create first admin (only if no users exist)
  router.post('/setup', setupLimiter, async (req, res: Response) => {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password || !firstName || !lastName)
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Email inválido.' });

    try {
      const existing = await pool.query('SELECT id FROM users LIMIT 1');
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'Ya existe un usuario. Usa el login.' });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim()],
      );
      const user = sanitizeUser(result.rows[0]);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      console.log(`✅ Admin inicial creado: ${email}`);
      res.cookie('auth_token', token, COOKIE_OPTS);
      return res.status(201).json({ user });
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Setup Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/auth/login
  router.post('/login', authLimiter, async (req, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });

    try {
      const result = await pool.query<UserRow>(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()],
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: 'Credenciales inválidas.' });

      const row = result.rows[0];
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

      const user = sanitizeUser(row);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      res.cookie('auth_token', token, COOKIE_OPTS);
      return res.json({ user });
    } catch (error) {
      console.error('[Login Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
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
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Me Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // PATCH /api/auth/profile
  router.patch('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nombre y apellido requeridos.' });
    try {
      const result = await pool.query<UserRow>(
        'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [firstName.trim(), lastName.trim(), req.user!.id],
      );
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Profile Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // PATCH /api/auth/password
  router.patch('/password', requireAuth, async (req: AuthRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Ambas contraseñas son requeridas.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'Nueva contraseña mínimo 8 caracteres.' });
    try {
      const result = await pool.query<UserRow>(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user!.id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Password Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
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
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/users
  router.post('/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password || !firstName || !lastName || !role)
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido.' });
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await pool.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim(), role],
      );
      return res.status(201).json(sanitizeUser(result.rows[0]));
    } catch (error: unknown) {
      const dbErr = error as { code?: string };
      if (dbErr.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Create User Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // PATCH /api/users/:id/role
  router.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    try {
      const result = await pool.query<UserRow>(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [role, id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Update Role Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // DELETE /api/users/:id — soft-delete
  router.delete('/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    try {
      const result = await pool.query(
        'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
        [id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Delete User Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  return router;
}
