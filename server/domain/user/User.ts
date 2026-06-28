/** System user roles with escalating permissions */
export type UserRole = 'admin' | 'editor' | 'viewer';

/** Core User entity representing a system user */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Internal user representation including the bcrypt password hash */
export interface UserWithHash extends User {
  passwordHash: string;
}

/** Input for creating a new system user */
export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

/** User extended with account lockout tracking fields */
export interface UserWithLockout extends UserWithHash {
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
}

/** Statistics for the frontend dashboard overview */
export interface DashboardStats {
  totalJobs: number;
  totalCompanies: number;
  enrichedCompanies: number;
  pendingEnrichment: number;
  totalApplications: number;
  totalCandidates: number;
  activeCandidates: number;
  placedCandidates: number;
}
