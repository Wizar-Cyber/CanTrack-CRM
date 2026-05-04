import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { User } from '../../domain/user/User.js';
import { DomainError } from '../../domain/shared/DomainError.js';

export class UpdateProfileUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(userId: string, firstName: string, lastName: string): Promise<User> {
    if (!firstName?.trim() || !lastName?.trim()) {
      throw new DomainError('Nombre y apellido requeridos.');
    }
    return this.users.updateProfile(userId, firstName.trim(), lastName.trim());
  }
}
