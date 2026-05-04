export type JobSource = 'linkedin' | 'indeed' | 'glassdoor' | 'company_website' | 'other';

export interface Job {
  id: string;
  companyId:      string | null;
  rawCompanyName: string | null;
  companyName:    string | null; // computed: COALESCE(c.name, raw_company_name)
  title:          string;
  source:         JobSource;
  url:            string;
  location:       string | null;
  country:        string | null;
  category:       string | null;
  applicationType: string | null;
  isEasyApply:    boolean;
  isActive:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

export interface CreateJobInput {
  companyId?:      string;
  rawCompanyName?: string;
  title:           string;
  source:          JobSource;
  url:             string;
  location?:       string;
  country?:        string;
  category?:       string;
  applicationType?: string;
  isEasyApply?:    boolean;
}

export interface UpdateJobFields {
  title?:          string;
  url?:            string;
  location?:       string;
  country?:        string;
  category?:       string;
  applicationType?: string;
  isEasyApply?:    boolean;
  isActive?:       boolean;
}

export interface JobListResult {
  data:       Job[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
}

export interface JobListQuery {
  page?:   number;
  limit?:  number;
  search?: string;
}
