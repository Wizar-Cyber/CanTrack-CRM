export type UserRole = 'admin' | 'editor' | 'viewer';

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

export interface UserWithHash extends User {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

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
