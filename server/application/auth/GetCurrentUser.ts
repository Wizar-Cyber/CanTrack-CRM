import type { IUserRepository } from '../../domain/user/IUserRepository.js';
import type { User } from '../../domain/user/User.js';
import { NotFoundError } from '../../domain/shared/DomainError.js';

export class GetCurrentUserUseCase {
  constructor(private readonly users: IUserRepository) {}

  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Usuario');
    return user;
  }
}
