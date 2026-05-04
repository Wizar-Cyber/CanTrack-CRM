import type { User, UserWithHash, CreateUserInput, UserRole, DashboardStats } from './User.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByIdWithHash(id: string): Promise<UserWithHash | null>;
  findByEmail(email: string): Promise<UserWithHash | null>;
  isActive(id: string): Promise<boolean>;
  countAll(): Promise<number>;
  findAll(): Promise<User[]>;
  create(input: CreateUserInput): Promise<User>;
  updateProfile(id: string, firstName: string, lastName: string): Promise<User>;
  updatePasswordHash(id: string, hash: string): Promise<void>;
  updateRole(id: string, role: UserRole): Promise<User | null>;
  deactivate(id: string): Promise<boolean>;
  getStats(): Promise<DashboardStats>;
}
