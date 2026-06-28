# API Reference

Base URL: `/api`

All authenticated endpoints require httpOnly `auth_token` cookie or `Authorization: Bearer <token>` header.

---

## Authentication

### `POST /api/auth/setup`
Create initial admin (no users exist yet).
- **Body**: `{ email, password, firstName, lastName }`
- **Response**: `{ token, user }`

### `POST /api/auth/login`
- **Body**: `{ email, password }`
- **Response**: `{ token, user }`
- **Set-Cookie**: `auth_token` (httpOnly)

### `POST /api/auth/logout`
Clears auth cookie.

### `GET /api/auth/me`
Returns current user profile.

### `PATCH /api/auth/profile`
Update `{ firstName, lastName }`.

### `PATCH /api/auth/password`
Change password: `{ currentPassword, newPassword }`.

---

## User Management (admin only)

### `GET /api/users`
List all users.

### `POST /api/users`
Create user: `{ email, password, firstName, lastName, role }`.

### `PATCH /api/users/:id/role`
Update role: `{ role }` (admin/editor/viewer).

### `DELETE /api/users/:id`
Deactivate user (soft delete).

---

## Companies

### `GET /api/companies`
List companies. Query params: `?includeUnenriched=1`.

### `GET /api/companies/:id`
Get company by ID.

### `POST /api/companies`
Create company: `{ name, legal_name?, website?, industry? }`.

### `PATCH /api/companies/:id`
Update company (column allowlist prevents injection).

### `DELETE /api/companies/:id`
Delete company (fails if has jobs).

### `GET /api/companies/:id/email-logs`
Email history for company.

### `POST /api/companies/:id/send-offer`
Send staffing offer via MDirector.

### `PATCH /api/companies/:id/tipo`
Set commercial classification: `{ tipo: 'verde'|'naranja'|'morado'|'rojo' }`.

### `PATCH /api/companies/:id/google-maps-status`
Set Maps status: `{ status: 'open'|'closed'|'unknown' }`.

### `POST /api/companies/:id/suggest-services`
Generate AI service suggestions.

### `GET /api/companies/:id/suggest-services`
Get cached service suggestions.

---

## Jobs

### `GET /api/jobs`
List jobs with optional filters.

### `POST /api/jobs`
Create job.

### `GET /api/jobs/:id`
Get job details.

### `PATCH /api/jobs/:id`
Update job.

### `DELETE /api/jobs/:id`
Delete job.

---

## Candidates

### `GET /api/candidates`
List candidates.

### `POST /api/candidates`
Create candidate.

### `GET /api/candidates/:id`
Get candidate.

### `PATCH /api/candidates/:id`
Update candidate.

---

## Applications

### `GET /api/applications`
List all applications.

### `GET /api/applications/queue`
Get application queue.

---

## Enrichment

### `POST /api/gemini/enrich`
Enrich specific company: `{ companyId, companyName }`.

### `POST /api/enrichment/process-next`
Process next pending company in queue.

### `GET /api/enrichment/status`
Queue statistics (pending/processing/scraped/db_matched).

---

## Campaigns

### `GET /api/campaigns/config`
Get campaign configuration.

### `PATCH /api/campaigns/config`
Update campaign configuration.

### `GET /api/campaigns/preview`
Preview queued campaign contacts.

### `POST /api/campaigns/send`
Send campaign to selected contacts.

### `GET /api/campaigns/history`
Campaign send history.

### `GET /api/campaigns/sheet-companies`
Companies from Google Sheets with enrichment data.

---

## MDirector

### `GET /api/mdirector/status`
Check MDirector credentials.

### `GET /api/mdirector/lists`
Fetch MDirector mailing lists.

---

## Sync

### `POST /api/sync/scraped-jobs`
Sync scraped jobs from staging table.

---

## Webhook

### `POST /api/webhook`
Receive scraped job data (authenticated via WEBHOOK_SECRET).

---

## Routes

### `GET /api/routes`
List visit routes.

### `POST /api/routes`
Create route.

### `GET /api/routes/:id`
Get route with stops.

---

## Export

### `POST /api/companies/export`
Export companies to Excel.
- **Body**: `{ ids?: string[], serviceId?: string }`

---

## Health

### `GET /api/health`
Server health check.

---

## Webhook Formats

### Incoming Job Payload
```json
[
  {
    "title": "Software Engineer",
    "company_name": "Tech Corp",
    "url": "https://careers.techcorp.com/job/123",
    "location": "Toronto, ON",
    "source": "greenhouse"
  }
]
```

### Enrichment Data Response
```json
{
  "industry": "Information Technology",
  "company_size": "201-500",
  "website": "https://techcorp.com",
  "description": "...",
  "hq_city": "Toronto",
  "hq_province": "ON",
  "phone": "+1-416-555-0000",
  "contact_email": "hr@techcorp.com",
  "_provider": "gemini+groq"
}
```
