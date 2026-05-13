import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import { NotFoundError, UnauthorizedError, DomainError } from '../../domain/shared/DomainError.js';

export class ChangePasswordUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword || !newPassword) throw new DomainError('Both passwords are required.');
    if (newPassword.length < 8) throw new DomainError('New password must be at least 8 characters.');

    const row = await this.users.findByIdWithHash(userId);
    if (!row) throw new NotFoundError('Usuario');

    const valid = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!valid) throw new UnauthorizedError('Current password is incorrect.');

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.users.updatePasswordHash(userId, newHash);
  }
}
