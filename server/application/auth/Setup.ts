import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { User } from '../../domain/user/User.js';
import { DomainError, ConflictError } from '../../domain/shared/DomainError.js';

export interface SetupInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface SetupOutput {
  token: string;
  user: Omit<User, 'updatedAt'>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class SetupUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(input: SetupInput): Promise<SetupOutput> {
    if (!input.email || !input.password || !input.firstName || !input.lastName) {
      throw new DomainError('Todos los campos son requeridos.');
    }
    if (input.password.length < 8) throw new DomainError('Contraseña mínimo 8 caracteres.');
    if (!EMAIL_RE.test(input.email))  throw new DomainError('Email inválido.');

    const existing = await this.users.countAll();
    if (existing > 0) throw new ConflictError('Ya existe un usuario. Usa el login.');

    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.users.create({
        email:     input.email.toLowerCase().trim(),
        passwordHash,
        firstName: input.firstName.trim(),
        lastName:  input.lastName.trim(),
        role:      'admin',
      });

      const secret = process.env.JWT_SECRET!;
      const token  = jwt.sign(
        { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
        secret,
        { expiresIn: '8h' },
      );
      return { token, user };
    } catch (err: unknown) {
      const dbErr = err as { code?: string };
      if (dbErr.code === '23505') throw new ConflictError('Email ya registrado.');
      throw err;
    }
  }
}
