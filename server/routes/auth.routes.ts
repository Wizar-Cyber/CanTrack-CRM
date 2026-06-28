import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { createRequireAuth, requireRole, AuthRequest } from '../middleware/auth.middleware.js';
import { auth as authCfg } from '../lib/config.js';
import { signToken, setAuthCookie, sanitizeUser } from '../utils/auth-helpers.js';

export function createAuthRouter(pool: Pool): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool);

  // ── Rate Limiters ───────────────────────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many password change attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const setupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Setup limit reached.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting
  router.use('/auth/password', passwordLimiter);

  // ==========================================================================
  // AUTH ROUTES (public)
  // ==========================================================================

  // POST /api/auth/setup — Create first admin (only if no users exist)
  router.post('/auth/setup', setupLimiter, async (req, res) => {
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

      const passwordHash = await bcrypt.hash(password, authCfg.bcryptRounds);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim()]
      );
      const user = sanitizeUser(result.rows[0]);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      setAuthCookie(res, token);
      console.log(`✅ Admin inicial creado: ${email}`);
      return res.status(201).json({ token, user });
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Setup Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });

    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND is_active = true',
        [email.toLowerCase().trim()]
      );
      if (result.rows.length === 0)
        return res.status(401).json({ error: 'Credenciales inválidas.' });

      const row = result.rows[0];
      const valid = await bcrypt.compare(password, row.password_hash);
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

      const user = sanitizeUser(row);
      const token = signToken({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
      setAuthCookie(res, token);
      return res.json({ token, user });
    } catch (error) {
      console.error('[Login Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ==========================================================================
  // AUTH ROUTES (protected)
  // ==========================================================================

  router.post('/auth/logout', (_req, res) => {
    res.clearCookie('auth_token', { path: '/' });
    return res.json({ success: true });
  });

  router.get('/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [req.user!.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Me Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  router.patch('/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nombre y apellido requeridos.' });
    try {
      const result = await pool.query(
        'UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [firstName.trim(), lastName.trim(), req.user!.id]
      );
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Profile Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  router.patch('/auth/password', requireAuth, async (req: AuthRequest, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Ambas contraseñas son requeridas.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'Nueva contraseña mínimo 8 caracteres.' });
    try {
      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Contraseña actual incorrecta.' });
      const newHash = await bcrypt.hash(newPassword, authCfg.bcryptRounds);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.id]);
      return res.json({ success: true });
    } catch (error) {
      console.error('[Password Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  // ==========================================================================
  // USER MANAGEMENT (admin only)
  // ==========================================================================

  router.get('/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users ORDER BY created_at ASC'
      );
      return res.json(result.rows.map(sanitizeUser));
    } catch (error) {
      console.error('[Users List Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  router.post('/users', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { email, password, firstName, lastName, role } = req.body;
    const ALLOWED_ROLES = ['admin', 'editor', 'viewer'];
    if (!email || !password || !firstName || !lastName || !role)
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    if (typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'Contraseña mínimo 8 caracteres.' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email inválido.' });
    try {
      const passwordHash = await bcrypt.hash(password, authCfg.bcryptRounds);
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email.toLowerCase().trim(), passwordHash, firstName.trim(), lastName.trim(), role]
      );
      return res.status(201).json(sanitizeUser(result.rows[0]));
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email ya registrado.' });
      console.error('[Create User Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  router.patch('/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { role } = req.body;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes cambiar tu propio rol.' });
    if (!['admin', 'editor', 'viewer'].includes(role)) return res.status(400).json({ error: 'Rol inválido.' });
    try {
      const result = await pool.query(
        'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [role, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      return res.json(sanitizeUser(result.rows[0]));
    } catch (error) {
      console.error('[Update Role Error]:', error);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }
  });

  router.delete('/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
    const { id } = req.params;
    if (id === req.user!.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    try {
      const result = await pool.query(
        'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [id]
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
