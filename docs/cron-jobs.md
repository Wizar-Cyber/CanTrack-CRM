# Cron Jobs & Automation

## Overview

Background jobs run in-process via `setInterval`. No external cron daemon required.

## Job Schedule

| Job | Interval | Description |
|---|---|---|
| **Geocoding** | 60 min | Geocode companies without lat/lng coordinates |
| **Campaign Automation** | 15 min (check) | Send scheduled email campaigns |
| **Workflow Automation** | 15 min (check) | Runs at 08:00 and 20:00 UTC |
| **Fast Sync** | 5 min | Link unlinked jobs to province companies |
| **Enrichment** | 8 seconds | Process 5 pending companies per cycle |

## Implementation

File: `server/automation/cron-jobs.ts`

### Geocoding (`geocodePendingCompanies`)

- Reads companies from `ontario_companies` and `quebec_companies` where `lat IS NULL`
- Uses **Mapbox** (~10 req/s parallel) with **Nominatim** fallback (1 req/s sequential)
- Updates `lat`, `lng`, `updated_at` columns
- Skips previously failed addresses within same run

### Campaign Automation (`checkAndRunCampaigns`)

- Checks `campaign_config.auto_enabled`
- Runs at configured hour (default 08:00 UTC)
- Groups companies by `work` field
- Subscribes contacts to MDirector lists
- Creates delivery from template per work-group
- Respects `auto_min_gap_days`, `auto_new_days`, `auto_resend_days`
- Updates `email_campaign_log` and `last_campaign_at`

### Workflow Automation (`checkAndRunWorkflow`)

- Runs full workflow cycle: sync → enrich → export
- Runs at 08:00 and 20:00 UTC
- Deduplicates within same hour slot

### Fast Sync (`runFastSync`)

- Links jobs with `province_id IS NULL` to province companies
- Matches by `raw_company_name` using slug/normalized name
- Creates new province company entries if not found

### Enrichment (`enrichNextPending`)

- Processes 5 companies per 8-second cycle
- Unsticks companies stuck in 'processing' > 5 minutes
- Only enriches companies with linked jobs
- Cascades: enrichment → service suggestion

## Automation Logs

Tables: `automation_log`, `automation_alerts`

- `automation_log` records each job execution
- `automation_alerts` tracks non-fatal issues (email bounces, enrichment failures)
