export type ApplicationStatus = 'Saved' | 'Applied' | 'Interview' | 'Offer' | 'Rejected' | 'Placed';

export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  status: ApplicationStatus;
  appliedDate: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApplicationWithContext extends Application {
  jobTitle?: string;
  companyName?: string;
}

export interface CreateApplicationInput {
  jobId: string;
  candidateId: string;
  status?: ApplicationStatus;
  notes?: string;
}
