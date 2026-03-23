export type JobSource = 'linkedin' | 'indeed';
export type JobStatus = 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';

export interface Company {
  id: string;
  name: string; // normalized name
  slug: string;
  legalName?: string;
  industry?: string;
  sector?: string;
  size?: string;
  canadianHQ?: boolean;
  hqCity?: string;
  hqProvince?: string;
  exactAddress?: string;
  website?: string;
  description?: string;
  isPubliclyTraded?: boolean;
  stockTicker?: string;
  knownATSPortal?: string;
  techStack?: string[];
  confidenceScore?: number;
  needsManualReview?: boolean;
  enrichedAt?: string;
  location?: string; // Legacy fallback
  enrichmentStatus?: 'pending' | 'db_matched' | 'scraped';
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
  isEasyApply?: boolean;
  country?: string;
}

export interface DashboardStats {
  totalJobs: number;
  activeCandidates: number;
  totalApplications: number;
  placements: number;
}

export interface ImportStats {
  total: number;
  jobsNew: number;
  jobsDuplicate: number;
  companiesExact: number;
  companiesFuzzy: number;
  companiesNew: number;
  companiesSkipped: number;
  apiCallsGemini: number;
  apiCallsPlaces: number;
  estimatedCostUSD: number;
  errors: Array<{ company: string; error: string }>;
  duration: number;
}
