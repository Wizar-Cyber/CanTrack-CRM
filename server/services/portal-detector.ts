export type PortalType = 
  | 'greenhouse' 
  | 'lever' 
  | 'ashby' 
  | 'smartrecruiters'
  | 'linkedin' 
  | 'indeed' 
  | 'workday'
  | 'unknown';

export interface ParsedJob {
  portal: PortalType;
  companySlug: string;
  jobId: string;
  applyEndpoint: string | null; // null = needs extension
}

export function detectPortalFromUrl(url: string): ParsedJob {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;

    // ── GREENHOUSE ──────────────────────────────────────────
    if (host.includes('greenhouse.io')) {
      const match = path.match(/\/jobs\/(\d+)/);
      const slugMatch = host.match(/^(.+)\.greenhouse\.io/) 
        || path.match(/^\/([^\/]+)\/jobs/);
      const slug = slugMatch?.[1] || '';
      const jobId = match?.[1] || '';
      return {
        portal: 'greenhouse',
        companySlug: slug,
        jobId: jobId,
        applyEndpoint: slug && jobId ? `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}/applications` : null,
      };
    }

    // ── LEVER ────────────────────────────────────────────────
    if (host.includes('lever.co')) {
      const parts = path.split('/').filter(Boolean);
      return {
        portal: 'lever',
        companySlug: parts[0] || '',
        jobId: parts[1] || '',
        applyEndpoint: parts[1] ? `https://api.lever.co/v0/postings/${parts[1]}/apply` : null,
      };
    }

    // ── ASHBY ────────────────────────────────────────────────
    if (host.includes('ashbyhq.com')) {
      const parts = path.split('/').filter(Boolean);
      return {
        portal: 'ashby',
        companySlug: parts[0] || '',
        jobId: parts[1] || '',
        applyEndpoint: `https://api.ashbyhq.com/applicationForm.submit`,
      };
    }

    // ── SMARTRECRUITERS ──────────────────────────────────────
    if (host.includes('smartrecruiters.com')) {
      const parts = path.split('/').filter(Boolean);
      return {
        portal: 'smartrecruiters',
        companySlug: parts[0] || '',
        jobId: parts[1] || '',
        applyEndpoint: parts[0] && parts[1] ? `https://api.smartrecruiters.com/v1/companies/${parts[0]}/postings/${parts[1]}/questionnaire/apply` : null,
      };
    }

    // ── LINKEDIN ─────────────────────────────────────────────
    if (host.includes('linkedin.com')) {
      const match = path.match(/\/jobs\/view\/(\d+)/);
      return {
        portal: 'linkedin',
        companySlug: '',
        jobId: match?.[1] || '',
        applyEndpoint: null,
      };
    }

    // ── INDEED ───────────────────────────────────────────────
    if (host.includes('indeed.com')) {
      const jk = u.searchParams.get('jk') || '';
      return {
        portal: 'indeed',
        companySlug: '',
        jobId: jk,
        applyEndpoint: null,
      };
    }

    // ── WORKDAY ──────────────────────────────────────────────
    if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
      return {
        portal: 'workday',
        companySlug: host.split('.')[0],
        jobId: path.split('/').pop() || '',
        applyEndpoint: null,
      };
    }

    return { portal: 'unknown', companySlug: '', jobId: '', applyEndpoint: null };
  } catch (e) {
    return { portal: 'unknown', companySlug: '', jobId: '', applyEndpoint: null };
  }
}
