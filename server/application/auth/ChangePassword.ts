import bcrypt from 'bcryptjs';
import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import { NotFoundError, UnauthorizedError, DomainError } from '../../domain/shared/DomainError.js';

export class ChangePasswordUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword || !newPassword) throw new DomainError('Ambas contraseñas son requeridas.');
    if (newPassword.length < 8) throw new DomainError('Nueva contraseña mínimo 8 caracteres.');

    const row = await this.users.findByIdWithHash(userId);
    if (!row) throw new NotFoundError('Usuario');

    const valid = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!valid) throw new UnauthorizedError('Contraseña actual incorrecta.');

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.users.updatePasswordHash(userId, newHash);
  }
}
