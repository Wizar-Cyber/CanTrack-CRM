/**
 * Bundles CreateUser, UpdateUserRole and DeactivateUser into a single file
 * since they share the same repository and validation logic.
 */
import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { User, UserRole } from '../../domain/user/User.js';
import { DomainError, ConflictError, NotFoundError } from '../../domain/shared/DomainError.js';

const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES: UserRole[] = ['admin', 'editor', 'viewer'];

// ── List all users ────────────────────────────────────────────────────────────
export class ListUsersUseCase {
  constructor(private readonly users: IUserRepository) {}
  async execute(): Promise<User[]> { return this.users.findAll(); }
}

// ── Create a new user (admin only) ───────────────────────────────────────────
export class CreateUserUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(input: {
    email: string; password: string;
    firstName: string; lastName: string; role: string;
  }): Promise<User> {
    const { email, password, firstName, lastName, role } = input;
    if (!email || !password || !firstName || !lastName || !role) {
      throw new DomainError('All fields are required.');
    }
    if (password.length < 8)           throw new DomainError('Password must be at least 8 characters.');
    if (!ALLOWED_ROLES.includes(role as UserRole)) throw new DomainError('Invalid role.');
    if (!EMAIL_RE.test(email))          throw new DomainError('Invalid email.');

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      return await this.users.create({
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        role: role as UserRole,
      });
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23505') throw new ConflictError('Email already registered.');
      throw err;
    }
  }
}

// ── Update user role ──────────────────────────────────────────────────────────
export class UpdateUserRoleUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(requesterId: string, targetId: string, role: string): Promise<User> {
    if (requesterId === targetId) throw new DomainError('You cannot change your own role.');
    if (!ALLOWED_ROLES.includes(role as UserRole)) throw new DomainError('Invalid role.');
    const updated = await this.users.updateRole(targetId, role as UserRole);
    if (!updated) throw new NotFoundError('Usuario');
    return updated;
  }
}

// ── Soft-delete / deactivate user ────────────────────────────────────────────
export class DeactivateUserUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(requesterId: string, targetId: string): Promise<void> {
    if (requesterId === targetId) throw new DomainError('You cannot delete your own account.');
    const ok = await this.users.deactivate(targetId);
    if (!ok) throw new NotFoundError('Usuario');
  }
}
