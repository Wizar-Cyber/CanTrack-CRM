import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { User } from '../../domain/user/User.js';
import { UnauthorizedError, DomainError } from '../../domain/shared/DomainError.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  token: string;
  user: Omit<User, 'updatedAt'>;
}

export class LoginUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    if (!input.email || !input.password) {
      throw new DomainError('Email y contraseña son requeridos.');
    }

    const row = await this.users.findByEmail(input.email.toLowerCase().trim());
    if (!row) throw new UnauthorizedError('Credenciales inválidas.');

    const valid = await bcrypt.compare(input.password, row.passwordHash);
    if (!valid) throw new UnauthorizedError('Credenciales inválidas.');

    const secret = process.env.JWT_SECRET!;
    const token  = jwt.sign(
      { id: row.id, email: row.email, role: row.role, firstName: row.firstName, lastName: row.lastName },
      secret,
      { expiresIn: '8h' },
    );

    const { passwordHash: _, ...user } = row;
    return { token, user };
  }
}
