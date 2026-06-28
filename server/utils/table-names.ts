const ALLOWED_TABLES = new Set([
  'companies',
  'ontario_companies',
  'quebec_companies',
  'jobs',
  'candidates',
  'applications',
  'users',
  'email_logs',
  'automation_log',
  'candidate_skills',
  'company_tech_stack',
  'job_required_skills',
  'user_saved_jobs',
  'scraped_jobs',
]);

export function validateTableName(name: string): string {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}
