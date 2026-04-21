export type JobSource = 'linkedin' | 'indeed' | 'glassdoor' | 'company_website' | 'other';
export type JobStatus = 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';

export interface Company {
  id: string;
  name: string; // normalized name
  slug: string;
  legalName?: string;
  industry?: string;
  size?: string;           // company_size
  hqCity?: string;
  hqProvince?: string;
  hqCountry?: string;
  exactAddress?: string;
  phone?: string;
  contactEmail?: string;
  website?: string;
  description?: string;
  knownATSPortal?: string;
  enrichedAt?: string;
  location?: string; // Legacy fallback
  enrichmentStatus?: 'pending' | 'db_matched' | 'scraped' | 'verified' | 'failed' | 'processing';
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
  postedAt?: string;
  // Datos de la empresa asociada (ya enriquecidos o pendientes)
  companyEnrichmentStatus?: Company['enrichmentStatus'];
  companyIndustry?: string;
  companyHqCity?: string;
  companyHqCountry?: string;
  companyWebsite?: string;
  companyConfidenceScore?: number;
  // Mapeo al catálogo de 52 servicios CanTrack (IA clasificador)
  serviceTypeId?: string | null;
  serviceName?: string | null;
  serviceNumber?: number | null;
  serviceCategory?: string | null;
  titleDisplay?: string;           // título limpio: servicio mapeado > título crudo
  hasDirectServiceMatch?: boolean; // false = el clasificador no encontró match
}

export interface DashboardStats {
  totalJobs: number;
  activeCandidates: number;
  totalApplications: number;
  placements: number;
  enrichedCompanies: number;
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
