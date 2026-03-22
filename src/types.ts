export type JobSource = 'linkedin' | 'indeed';
export type JobStatus = 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';

export interface Company {
  id: string;
  name: string;
  location?: string;
  size?: string;
  industry?: string;
  website?: string;
  contact_email?: string;
  phone?: string;
  description?: string;
}

export interface Candidate {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  resumeUrl?: string;
  yearsOfExperience: number;
  skills: string[];
  status: 'Available' | 'Placed' | 'Interviewing';
  avatar?: string;
  bio?: string;
}

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  status: JobStatus;
  appliedDate: string;
  notes?: string;
  mappingData?: Record<string, any>; // Data prepared for the extension
}

export interface Job {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  source: JobSource;
  url: string;
  location: string;
  category: string;
  isFavorite: boolean;
  applicationType: 'Easy Apply' | 'External';
  requiredSkills?: string[];
  status?: JobStatus;
  appliedDate?: string;
  notes?: string;
}

export interface DashboardStats {
  totalJobs: number;
  activeCandidates: number;
  totalApplications: number;
  placements: number;
}
