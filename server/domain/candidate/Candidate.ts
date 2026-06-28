/** Candidate pipeline status */
export type CandidateStatus = 'Available' | 'Interviewing' | 'Placed' | 'Inactive';

/** Core Candidate entity representing a job seeker */
export interface Candidate {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  resumeUrl: string | null;
  yearsOfExperience: number | null;
  status: CandidateStatus;
  bio: string | null;
  skills: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** Input for adding a new candidate to the system */
export interface CreateCandidateInput {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  yearsOfExperience?: number;
  bio?: string;
  skills?: string[];
}

/** Fields that can be updated on an existing candidate */
export interface UpdateCandidateInput {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  resumeUrl?: string;
  yearsOfExperience?: number;
  bio?: string;
  status?: CandidateStatus;
  skills?: string[];
}
