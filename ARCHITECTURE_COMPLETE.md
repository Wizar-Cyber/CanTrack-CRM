# CanTrack CRM — Complete Architecture & Logic Manual

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Database Architecture](#3-database-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Data Flow: Job → Company → Enrich → Export](#6-data-flow)
7. [Campaign Automation](#7-campaign-automation)
8. [Route Optimization](#8-route-optimization)
9. [Google Sheets Export](#9-google-sheets-export)
10. [Security & Authentication](#10-security--authentication)
11. [Deployment](#11-deployment)

---

## 1. System Overview

CanTrack CRM is a Canadian-focused staffing agency management system. It consumes job vacancies from external scrapers, auto-enriches company data using AI, runs autonomous application agents, manages email campaigns, and provides route optimization.

**Core Workflow:**
```
Scraper → Job Vacancy → Webhook → Find/Create Company → AI Enrich → Province Table → Google Sheets
```

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | React + TypeScript + Vite | React 19, Vite 6 |
| **Backend** | Express.js (Node) | Via tsx |
| **Database** | PostgreSQL 17 | Docker |
| **AI/LLM** | Google Gemini 2.5 Flash | Primary enrichment |
| **AI Fallback** | Groq (llama-3.1-8b) | Secondary enrichment |
| **AI Last Resort** | DuckDuckGo + Wikipedia | Web search fallback |
| **Email** | MDirector API | OAuth2 + templates |
| **Auth** | JWT + bcryptjs + httpOnly cookies | 8h expiry |
| **Maps** | Mapbox Geocoding API | 100k req/month free |
| **Route Optimization** | Optimus_rutas (Python/FastAPI) | Microservice |
| **Container** | Docker + docker-compose | Multi-service |
| **Reverse Proxy** | Nginx | Production |

---

## 3. Database Architecture

### 3.1 Main Tables

#### `ontario_companies` — Ontario companies database (8,055 rows)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| nombre | TEXT | Company name (NOT NULL) |
| telefono | TEXT | Phone number |
| tipo | TEXT | Classification: verde/naranja/morado/rojo |
| correo | TEXT | Email address |
| direccion | TEXT | Full street address |
| provincia | TEXT | Province (full name: "Ontario") |
| region | TEXT | Administrative region |
| ciudad | TEXT | City |
| pueblo | TEXT | Town/municipality |
| work | TEXT | Work type (e.g., "CONSTRUCCION") |
| descripcion | TEXT | AI-enriched description |
| dominio_de_pagina | TEXT | Website URL |
| enrichment_status | TEXT | pending/processing/scraped/failed/db_matched |
| enrichment_provider | TEXT | gemini/groq/web_search |
| enriched_at | TIMESTAMPTZ | When AI enrichment ran |
| sheets_exported_at | TIMESTAMPTZ | When exported to Google Sheets |
| excel_exported_at | TIMESTAMPTZ | When exported to Excel |
| industry | TEXT | AI-enriched industry |
| company_size | TEXT | AI-enriched size range |
| suggested_services | JSONB | AI-suggested services |
| is_duplicate | BOOLEAN | Marked as duplicate |
| status | VARCHAR | Company status |
| created_at | TIMESTAMPTZ | Row creation |
| updated_at | TIMESTAMPTZ | Last update |
| last_campaign_at | TIMESTAMPTZ | Last email campaign sent |
| email_status | VARCHAR | Email validity status |
| email_bounce_count | INTEGER | Bounce counter |
| email_blocked_at | TIMESTAMPTZ | When email was blocked |
| lat | DOUBLE | Geocoded latitude |
| lng | DOUBLE | Geocoded longitude |
| slug | TEXT | URL-friendly name |

#### `quebec_companies` — Quebec companies database (15,676 rows)
Identical structure to `ontario_companies`.

#### `jobs` — Job vacancies
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | Auto-generated |
| title | TEXT | Job title |
| raw_company_name | TEXT | Company name from scraper |
| source | ENUM | linkedin/indeed/glassdoor/company_website/other |
| url | TEXT | Job URL |
| province_id | UUID | FK to ontario_companies or quebec_companies |
| province_source | TEXT | 'ontario' or 'quebec' |
| location | TEXT | Job location |
| country | TEXT | Job country |
| is_active | BOOLEAN | Soft delete flag |
| service_type_id | TEXT | CanTrack service classification |
| service_match_confidence | REAL | AI classification confidence |
| created_at | TIMESTAMPTZ | Job creation date |

#### `users` — System users
| Column | Type |
|--------|------|
| id | UUID PK |
| email | VARCHAR(255) UNIQUE |
| password_hash | VARCHAR(255) |
| first_name | VARCHAR(100) |
| last_name | VARCHAR(100) |
| role | ENUM (admin/editor/viewer) |
| is_active | BOOLEAN |
| failed_login_attempts | INTEGER |
| locked_until | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |

#### `email_campaign_log` — Campaign send history
| Column | Type |
|--------|------|
| id | UUID PK |
| company_id | UUID |
| company_name | VARCHAR |
| company_email | VARCHAR |
| work_label | VARCHAR |
| mdirector_campaign_id | VARCHAR |
| mdirector_list_id | VARCHAR |
| status | VARCHAR (sent/pending/failed) |
| sent_at | TIMESTAMPTZ |
| sent_by_user_id | UUID |
| notes | TEXT |

#### `campaign_config` — Automation configuration (singleton row)
| Column | Type | Default |
|--------|------|---------|
| auto_enabled | BOOLEAN | false |
| auto_ontario | BOOLEAN | true |
| auto_quebec | BOOLEAN | true |
| auto_new_days | INTEGER | 15 |
| auto_resend_days | INTEGER | 90 |
| auto_min_gap_days | INTEGER | 60 |
| auto_schedule_hour | INTEGER | 8 |
| auto_last_run_at | TIMESTAMPTZ | null |

#### `mdirector_template_map` — Email template mappings
| Column | Type |
|--------|------|
| id | UUID PK |
| region | TEXT (ontario/quebec) |
| work_label | TEXT |
| template_id | TEXT (MDirector template UUID) |
| template_name | TEXT |
| language | TEXT (en/fr/es) |
| active | BOOLEAN |

#### `email_suppression` — Bounced/unsubscribed emails
| Column | Type |
|--------|------|
| id | UUID PK |
| email | TEXT |
| domain | TEXT |
| reason | TEXT |
| source | TEXT |
| notes | TEXT |
| created_at | TIMESTAMPTZ |

---

## 4. Backend Architecture

### 4.1 Directory Structure
```
server/
├── application/         → Use cases (business logic)
│   ├── apply/          → Job application use cases
│   ├── auth/           → Login, setup, password, users
│   ├── candidate/      → Candidate CRUD
│   ├── company/        → Company enrichment, CRUD, export
│   ├── job/            → Job CRUD
│   └── sync/           → Scraped jobs sync
├── automation/         → Cron jobs
│   └── cron-jobs.ts    → All automated background tasks
├── data/               → Static data
│   ├── mdirectorSegments.ts  → MDirector list/segment IDs
│   └── serviceTypes.ts       → CanTrack service catalog
├── domain/             → Domain entities + interfaces
│   ├── application/    → Application entity
│   ├── candidate/      → Candidate entity
│   ├── company/        → Company entity + ports
│   ├── job/            → Job entity
│   ├── shared/         → Domain errors
│   └── user/           → User entity
├── lib/                → Shared utilities
│   ├── config.ts       → Centralized env config
│   ├── logger.ts       → Pino structured logger
│   └── validation.ts   → Zod validation schemas
├── middleware/          → Express middleware
│   ├── auth.middleware.ts     → JWT auth + role check
│   ├── audit-log.middleware.ts → Request audit logging
│   ├── error.middleware.ts    → Global error handler
│   ├── rate-limit.middleware.ts → Rate limiting
│   └── request-id.middleware.ts → UUID per request
├── routes/             → Express API routes
│   ├── agent.routes.ts      → AI application agent
│   ├── applications.routes.ts → Job applications
│   ├── auth.routes.ts       → Auth + user management
│   ├── campaign.routes.ts   → Email campaigns
│   ├── companies.routes.ts  → CRM companies
│   ├── enrichment.routes.ts → AI enrichment
│   ├── jobs.routes.ts       → Jobs
│   ├── ontario.routes.ts    → Ontario + Quebec tables
│   ├── sync.routes.ts       → Job sync
│   └── webhook.routes.ts    → External webhooks
├── services/           → External integrations
│   ├── application-agent.service.ts → Playwright auto-apply
│   ├── automation.service.ts        → Browser automation
│   ├── campaign-automation.service.ts → Auto campaign sending
│   ├── email-campaign.service.ts    → Campaign management
│   ├── enrichment.service.ts        → AI enrichment orchestrator
│   ├── gemini.service.ts            → Google Gemini AI
│   ├── google-sheets.service.ts     → Google Sheets API
│   ├── greenhouse.service.ts        → Greenhouse ATS
│   ├── groq.service.ts              → Groq AI fallback
│   ├── job-classifier.service.ts    → Job → CanTrack service
│   ├── lever.service.ts             → Lever ATS
│   ├── mdirector.service.ts         → MDirector email API
│   ├── ollama.service.ts            → Local LLM fallback
│   ├── portal-detector.ts           → ATS portal detection
│   ├── websearch.service.ts         → DuckDuckGo+Wikipedia
│   └── workflow.service.ts          → Full workflow cycle
└── utils/             → Utilities
    ├── normalization.ts → String normalization
    ├── passwordPolicy.ts → Password validation rules
    ├── region-filter.ts → Geographic filtering
    └── slug.ts          → URL slug generation
```

### 4.2 Cron Jobs (`server/automation/cron-jobs.ts`)

| Job | Interval | Description |
|-----|----------|-------------|
| **Geocoding** | Every 60 min | Geocodes addresses in province tables |
| **Campaign Auto** | Every 15 min | Sends automated email campaigns |
| **Workflow** | Every 15 min (08:00/20:00 UTC) | Full cycle: sync→enrich→copy→export |
| **FastSync** | Every 5 min | Links unlinked jobs to companies |
| **Enrichment** | Every 8 sec (batch 5) | Enriches pending companies with job links |

### 4.3 API Endpoints Summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | No | User login |
| `/api/auth/setup` | POST | No | First admin setup |
| `/api/auth/logout` | POST | Yes | Logout |
| `/api/auth/password` | PATCH | Yes | Change password |
| `/api/auth/me` | GET | Yes | Current user |
| `/api/auth/profile` | PATCH | Yes | Update profile |
| `/api/auth/password-policy` | GET | No | Get password rules |
| `/api/users` | GET/POST | Admin | List/create users |
| `/api/users/:id/role` | PATCH | Admin | Change user role |
| `/api/users/:id` | DELETE | Admin | Deactivate user |
| `/api/jobs` | GET | Yes | List jobs |
| `/api/jobs/:id` | GET | Yes | Single job detail |
| `/api/stats` | GET | Yes | Dashboard stats |
| `/api/health` | GET | No | Health check |
| `/api/webhook/scraper` | POST | Secret | Ingest new job |
| `/api/enrichment/process-next` | POST | Yes | Enrich next pending company |
| `/api/sync/scraped-jobs` | POST | Yes | Sync unlinked jobs |
| `/api/{province}/companies` | GET | Yes | List province companies |
| `/api/campaign/send-template` | POST | Admin | Send campaign |
| `/api/campaign/auto-config` | GET/PATCH | Admin | Auto campaign config |
| `/api/campaign/auto-run` | POST | Admin | Trigger automation |
| `/api/campaign/history` | GET | Admin | Campaign log |
| `/api/campaign/preview` | POST | Admin | Preview recipients |
| `/api/campaign/distinct-work` | GET | Admin | Work type list |
| `/api/campaign/distinct-city` | GET | Admin | City list |
| `/api/export/run-now` | POST | Admin | Force export |
| `/api/geocoding/status` | GET | Yes | Geocoding progress |
| `/api/geocoding/run` | POST | Yes | Run geocoding |

---

## 5. Frontend Architecture

### 5.1 Directory Structure
```
src/
├── components/
│   ├── Auth/           → Login, Setup, ChangePassword
│   ├── Campaigns/      → Email campaign module
│   ├── Candidates/     → Candidate management
│   ├── Companies/      → Company list, detail, hub
│   ├── Dashboard/      → Operational dashboard
│   ├── Jobs/           → Job board, table, detail, queue
│   ├── Layout/         → Sidebar, Topbar
│   ├── Ontario/        → Ontario+Quebec company view
│   ├── Profiles/       → Job profiles (52 CanTrack services)
│   ├── Routes/         → Route manager, geocoding
│   ├── Security/       → Role management
│   ├── Services/       → Service catalog
│   ├── Settings/       → Profile, user management
│   ├── UI/             → Reusable components (Badges, Toast, etc.)
│   ├── Visits/         → Visit planner
│   └── VoiceAgent/     → Voice agent UI
├── contexts/           → React contexts
│   └── AuthContext.tsx → Authentication state
├── services/           → API client
│   ├── apiClient.ts    → Fetch wrapper
│   ├── geminiService.ts → Direct Gemini calls
│   └── mappingService.ts → Data mapping
├── types.ts            → TypeScript interfaces
└── App.tsx             → Root component + routes
```

### 5.2 Key Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/login` | Login | Login page |
| `/setup` | Setup | First admin setup |
| `/` | Dashboard | Main dashboard |
| `/jobs` | JobsView | Job board |
| `/companies` | OntarioCompanies | Province company tables |
| `/campaigns` | CampaignModule | Email campaigns |
| `/routes` | RouteManager | Visit route planner |
| `/settings` | Settings | Profile + user management |

---

## 6. Data Flow: Job → Company → Enrich → Export

### 6.1 Complete Flow

```
SCRAPER
  │
  ▼
WEBHOOK /api/webhook/scraper
  │
  ├── Check if company exists in ontario_companies OR quebec_companies
  │     (by slug OR normalized name)
  │
  ├── EXISTS → Link job via province_id + province_source
  │
  └── NOT FOUND → AI Enrichment Chain:
        │
        ├── GeminiService.enrichCompany(name)
        │   ├── Returns: industry, company_size, hq_city, hq_province,
        │   │           exact_address, phone, contact_email, website,
        │   │           description, is_closed, tipo, primary_service
        │   └── Uses: gemini-2.5-flash model
        │
        ├── GroqService.enrichCompany(name) [fallback, fills missing fields]
        │   └── Uses: llama-3.1-8b-instant
        │
        └── WebSearchService.enrichCompany(name) [last resort]
              └── DuckDuckGo + Wikipedia
        │
        └── Determine province from AI's hq_province field
              ├── "ON"/"Ontario" → ontario_companies
              └── "QC"/"Quebec" → quebec_companies
        │
        └── INSERT into province table with ALL enriched data
              └── enrichment_status = 'scraped' (or 'failed' if no data)
        │
        └── Link job via province_id + province_source
        │
        └── scheduleExcelExport() → 10s debounce → _flushToExcel()
              │
              └── Google Sheets API append:
                    ├── Ontario: [NOMBRE, TELÉFONO, TIPO, CORREO, DIRECCIÓN,
                    │            PROVINCIA, REGION, CIUDAD, PUEBLO, WORK,
                    │            DESCRIPCION, DOMINIO DE PAGINA]
                    └── Quebec:  [Nombre, TELÉFONO, TIPO, CORREO, Fecha,
                                 DIRECCIÓN, PROVINCIA, REGIÓN, CIUDAD, PUEBLO,
                                 WORK, DESCRIPCION DEL TRABAJO, DOMINIO DE PAGINA]
              │
              └── UPDATE sheets_exported_at = NOW()
```

### 6.2 AI Enrichment Prompt (Gemini)

The AI is instructed to research each company and return ONLY valid JSON with these fields:
- `industry` — Sector (Construction, Manufacturing, etc.)
- `company_size` — Exact range ("1-10", "11-50", etc.)
- `hq_city`, `hq_province`, `hq_region`, `hq_town`, `hq_country` — Location data
- `exact_address` — Full street address (CRITICAL: no hallucination)
- `phone` — Phone with area code (CRITICAL: no hallucination)
- `contact_email` — Company email
- `website` — Official URL
- `description` — 2-3 specific sentences about the company
- `is_closed` — Boolean, true ONLY if permanently closed
- `tipo` — Classification based on size:
  - `verde`: 10+ employees, physical location, worth sales visit
  - `naranja`: Under 10 employees, small business, calls only
  - `morado`: Home-based, calls only
  - `rojo`: Closed/non-existent
- `primary_service` — Staffing service needed

### 6.3 Enrichment Cron (`cron-jobs.ts`)

Runs every 8 seconds, processes 5 companies per batch:
1. Unsticks companies stuck in 'processing' for >5 minutes
2. Locks next pending company WITH job link (JOIN jobs table)
3. Calls AI enrichment chain
4. Updates province table with results
5. Auto-suggests services via JobClassifierService

---

## 7. Campaign Automation

### 7.1 MDirector Integration

- **Auth**: OAuth2 password grant (username + password)
- **Authentication**: JWT token cached with 1-hour expiry
- **API Base**: `https://api.mdirector.com`
- **Ontario List ID**: `28` (French templates)
- **Quebec List ID**: `30` (English templates)
- **Credentials**: Configured via env vars:
  - `MDIRECTOR_USERNAME=107843`
  - `MDIRECTOR_PASSWORD=...`
  - `MDIRECTOR_FROM_EMAIL=info@vsmservices.ca`
  - `MDIRECTOR_FROM_NAME=VSM Services`
  - `MDIRECTOR_REPLY_TO=info@vsmservices.ca`

### 7.2 Campaign Types

**A. Mass Send (Manual)**
- UI: Campaigns → Mass Send
- Filters: Work type, City, Region
- Preview recipients before sending
- Creates delivery in MDirector via template

**B. Automated Schedule**
- UI: Campaigns → Auto Schedule
- Configurable: enable/disable, hour, regions, intervals
- Runs daily at configured UTC hour
- Cron checks every 15 minutes

### 7.3 Dedup Logic
1. **Email validation**: Filters out noreply, invalid, bounced, unsubscribed
2. **Min gap**: 60 days minimum between sends to same email
3. **Resend interval**: 90 days before re-sending to old companies
4. **New company window**: 15 days to treat as "new"
5. **Suppression list**: Bounced/unsubscribed emails are blocked permanently
6. **Duplicate tracking**: Checks auto_last_run_at to avoid daily double-fire

### 7.4 Campaign Creation in MDirector
```
For each work type group:
  1. Subscribe contacts to MDirector list + segment
  2. Create delivery from template with:
     - Name: "{WORK} {REGION} {DD/MM/YYYY}"
     - Subject: Same as name (or custom)
     - Language: fr (Ontario) / en (Quebec)
     - Segment: Specific to work type
     - Template: From mdirector_template_map
  3. Log to email_campaign_log
  4. Update last_campaign_at
```

---

## 8. Route Optimization

### 8.1 Architecture
- **Microservice**: Optimus_rutas (Python/FastAPI)
- **Port**: 8000 (internal Docker network)
- **Endpoint**: `http://optimus-rutas:8000`
- **Function**: Clusters companies by geographic proximity and optimizes visit routes

### 8.2 Route Creation
```
1. User selects region (Ontario/Quebec)
2. Selects city or town
3. Sets stops per route
4. System queries companies with addresses in that area
5. Groups into routes of N stops each
6. Creates route records with geocoded stops
7. Each stop has: company name, address, lat/lng, status
```

---

## 9. Google Sheets Export

### 9.1 Configuration
```
.env:
  ONTARIO_SHEETS_ID=1su_tF9M-oPeTqupb-rinCimZApuVh0uY_edqtyZyF5E
  QUEBEC_SHEETS_ID=1wP72JYH_dHeiMMF1YfBYjuiAKeDMI_LJ9l7rPD9Htl8
  GOOGLE_SERVICE_ACCOUNT_CREDENTIALS={...JSON...}
  EXPORT_TARGET=sheets        # or 'excel' or 'both'
```

### 9.2 Export Format

**Ontario Sheet** (12 columns):
```
NOMBRE | TELEFONO | TIPO | CORREO | DIRECCIÓN | PROVINCIA | REGION | CIUDAD | PUEBLO | WORK | DESCRIPCION | DOMINIO DE PAGINA
```

**Quebec Sheet** (13 columns):
```
Nombre | TELEFONO | TIPO | CORREO | Fecha | DIRECCION | PROVINCIA | REGIÓN | CIUDAD | PUEBLO | WORK | DESCRIPCION DEL TRABAJO | DOMINIO DE PAGINA
```

### 9.3 Export Triggers
1. **After enrichment**: `scheduleExcelExport()` → 10s debounce → `_flushToExcel()`
2. **Manual**: `POST /api/export/run-now`
3. **Cron workflow**: At 08:00 and 20:00 UTC

---

## 10. Security & Authentication

### 10.1 Authentication
- **JWT tokens** (8h expiry) stored in httpOnly cookies
- **bcryptjs** password hashing (12 rounds)
- **Rate limiting** on login (10 req/15min) and password change (5 req/15min)
- **Account lockout** after 5 failed attempts (15 min lock)
- **Password policy**: 8+ chars, uppercase, lowercase, number, special character

### 10.2 Authorization
- Roles: `admin`, `editor`, `viewer`
- Admin: Full access, user management, campaigns, enrichment
- Editor: Can edit data, view campaigns
- Viewer: Read-only access

### 10.3 Security Headers
- Helmet.js with HSTS (1 year, preload)
- CORS restricted to allowed origins
- CSRF protection via sameSite cookies
- Request size limiting (1mb)
- Audit logging for auth events

### 10.4 Data Protection
- All SQL queries use parameterized statements (no SQL injection)
- Passwords redacted from Pino logs
- API keys in environment variables only
- .env in .gitignore

---

## 11. Deployment

### 11.1 Docker Services
```
cantrack-app-1       → Express + React (port 3000)
postgresql           → PostgreSQL 17 (port 5432)
cantrack-optimus-rutas-1 → Python route optimizer (port 8000)
cantrack-ollama-1    → Local LLM (optional)
```

### 11.2 Container Build
```bash
docker compose build app
docker compose up -d app
```

### 11.3 Environment Variables (.env)
```
PORT=3000
DATABASE_URL=postgresql://user:pass@postgresql:5432/dbname
JWT_SECRET=<64+ char random>
WEBHOOK_SECRET=<random>

MDIRECTOR_USERNAME=107843
MDIRECTOR_PASSWORD=<password>
MDIRECTOR_FROM_EMAIL=info@vsmservices.ca
MDIRECTOR_FROM_NAME=VSM Services
MDIRECTOR_REPLY_TO=info@vsmservices.ca

GEMINI_API_KEY=<key>
GROQ_API_KEY=<key>

ONTARIO_SHEETS_ID=<google-sheet-id>
QUEBEC_SHEETS_ID=<google-sheet-id>
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS=<json>

MAPBOX_TOKEN=<token>
OPTIMUS_URL=http://optimus-rutas:8000
EXPORT_TARGET=sheets
```
