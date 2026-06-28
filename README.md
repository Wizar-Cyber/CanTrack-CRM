# CanTrack CRM

**Canadian-focused Staffing Agency CRM** — Job tracking, company intelligence, email marketing automation, and route optimization.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4-000000)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)](https://www.docker.com/)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Database](#database)
- [Docker](#docker)
- [Background Jobs](#background-jobs)
- [API Overview](#api-overview)
- [Frontend](#frontend)
- [Optimus_rutas Integration](#optimus_rutas-integration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## Overview

CanTrack CRM is a complete staffing agency management system designed for the Canadian market. It aggregates job listings from multiple portals, enriches company data using AI, manages email marketing campaigns via MDirector, optimizes field visit routes, and exports data to Google Sheets and Excel.

### Core Capabilities

| Feature | Description |
|---|---|
| **Job Aggregation** | Ingest job listings via webhooks from Greenhouse, Lever, and custom scrapers |
| **Company Enrichment** | AI pipeline (Gemini → Groq → Ollama → WebSearch) enriches company profiles |
| **Email Campaigns** | Segmented email marketing via MDirector with template management |
| **Route Optimization** | Field visit planning with Mapbox-powered optimization (Optimus_rutas) |
| **Data Export** | Real-time sync to Google Sheets + Excel download |
| **Background Geocoding** | Automatic address → coordinates conversion |
| **Commercial Classification** | TIPO system (verde/naranja/morado/rojo) for sales prioritization |

---

## Architecture

```mermaid
graph TB
    Client[Browser] --> Nginx[Nginx :8888]
    Nginx --> Vite[Vite Dev Server :5173]
    Nginx --> Express[Express API :3000]

    Express --> Auth[Auth Middleware]
    Express --> Routes[Route Handlers]
    Express --> Cron[Background Jobs]

    Routes --> UseCases[Application Use Cases]
    UseCases --> Domain[Domain Entities]
    UseCases --> Services[Business Services]
    
    Services --> ProviderChain[AI Provider Chain]
    ProviderChain --> Gemini[Gemini]
    ProviderChain --> Groq[Groq]
    ProviderChain --> Ollama[Ollama :11434]
    ProviderChain --> WebSearch[DuckDuckGo/Wikipedia]

    Services --> MDirector[MDirector API]
    Services --> Sheets[Google Sheets API]
    Services --> Mapbox[Mapbox API]

    Routes --> Repos[Database Repositories]
    Repos --> DB[(PostgreSQL :5432)]

    Cron --> Geocode[Geocoding]
    Cron --> Enrich[Enrichment Queue]
    Cron --> Campaigns[Campaign Automation]
    Cron --> Workflow[Workflow Sync]

    Express --> Optimus[Optimus_rutas :8000]
```

---

## Tech Stack

### Backend
- **Runtime**: Node.js 22 with `tsx` (TypeScript execution)
- **Framework**: Express 4
- **Database**: PostgreSQL 17 via `pg` driver
- **Auth**: JWT (httpOnly cookies), bcrypt
- **Logging**: Pino (structured JSON logger)
- **Validation**: Zod (schema validation)
- **Testing**: Vitest, Supertest

### Frontend
- **Framework**: React 19
- **Build**: Vite 6
- **Styling**: Tailwind CSS v4
- **Animation**: Framer Motion 12
- **Icons**: Lucide React
- **Routing**: React Router DOM 7

### AI & Data
- **Primary AI**: Google Gemini
- **Fallback AI**: Groq (llama-3.1-8b-instant)
- **Local AI**: Ollama (qwen2:0.5b)
- **Web Search**: DuckDuckGo + Wikipedia
- **Geocoding**: Mapbox + Nominatim fallback
- **Scraping**: Playwright (headless Chromium)

### Infrastructure
- **Containerization**: Docker, Docker Compose
- **Reverse Proxy**: Nginx
- **Database**: CasaOS-managed PostgreSQL 17
- **CI/CD**: Manual (VPS deployment)

---

## Quick Start

### Prerequisites

- Node.js 22+
- npm
- PostgreSQL 17
- Git

### Installation

```bash
# Clone the repository
git clone <repo-url> cantrack
cd cantrack

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection, JWT secret, and API keys

# Initialize database
psql -d your_database -f db/schema.sql
psql -d your_database -f db/seed.sql

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). First visit prompts for admin setup.

### First-Time Setup

1. Navigate to `/setup` to create the initial admin account
2. Configure MDirector credentials in Campaign Settings
3. Add AI API keys (Gemini, Groq) in `.env`
4. Set up Google Sheets integration if needed

---

## Configuration

See `.env.example` for all variables. Key configuration groups:

### Required
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=<64-char-hex-string>
```

### AI Enrichment (at least one required)
```env
GEMINI_API_KEY=your-gemini-key
# or
GROQ_API_KEY=your-groq-key
# or configure Ollama
```

### Email Marketing (optional)
```env
MDIRECTOR_USERNAME=107843
MDIRECTOR_PASSWORD=your-password
MDIRECTOR_FROM_EMAIL=info@example.ca
```

### Mapbox (optional, for geocoding + routing)
```env
MAPBOX_TOKEN=pk.eyJ1...
```

Full reference: [docs/configuration.md](docs/configuration.md)

---

## Database

Schema: `db/schema.sql` (401 lines)

### Core Tables

| Table | Rows | Purpose |
|---|---|---|
| `users` | ~5 | System users with roles |
| `companies` | ~200 | Enriched company profiles |
| `jobs` | ~1,000 | Job listings from scrapers |
| `ontario_companies` | ~8,000 | Ontario company database |
| `quebec_companies` | ~15,000 | Quebec company database |
| `candidates` | ~50 | Candidate profiles |
| `applications` | — | Job applications |
| `routes`/`route_stops` | — | Visit route planning |

### Migrations

Auto-migrations run on server startup (idempotent). Manual migrations in `db/migrations/`:

| File | Purpose |
|---|---|
| `003_triggers_and_indexes.sql` | Performance indexes |
| `004_normalize_addresses.sql` | Address normalization |
| `005_fix_address_assignments.sql` | Address fixes |
| `006_fulltext_indexes.sql` | Full-text search |

Full reference: [docs/database.md](docs/database.md)

---

## Docker

### Docker Compose

```bash
docker-compose up -d
```

Starts three services:

| Service | Port | Image |
|---|---|---|
| **CanTrack CRM** | `:3000` | Built from `Dockerfile` |
| **Optimus_rutas** | `:8000` | Built from `Optimus_rutas/Dockerfile` |
| **Ollama** | `:11434` | `ollama/ollama:latest` |

### Dockerfile

Multi-stage build:
1. **Builder stage**: Install dependencies, build frontend, install Playwright Chromium
2. **Production stage**: Copy artifacts, create non-root user, run with `tsx`

Full reference: [docs/architecture/deployment.md](docs/architecture/deployment.md)

---

## Background Jobs

All jobs run in-process via `setInterval`. No external cron daemon required.

| Job | Interval | Description |
|---|---|---|
| **Geocoding** | 60 min | Convert addresses to coordinates (Mapbox/Nominatim) |
| **Enrichment** | 8 sec | Process 5 companies per cycle via AI pipeline |
| **Fast Sync** | 5 min | Link unlinked jobs to province companies |
| **Campaign Auto** | 15 min | Send scheduled email campaigns |
| **Workflow** | 15 min | Full sync→enrich→export at 08:00/20:00 UTC |

Full reference: [docs/cron-jobs.md](docs/cron-jobs.md)

---

## API Overview

Base URL: `/api`

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/setup` | Create initial admin |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/auth/logout` | Clear session |

### Companies
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/companies` | List companies |
| POST | `/api/companies` | Create company |
| GET | `/api/companies/:id` | Get company details |
| PATCH | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company |
| POST | `/api/gemini/enrich` | Enrich single company |
| POST | `/api/enrichment/process-next` | Process enrichment queue |

### Campaigns
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/campaigns/config` | Get campaign configuration |
| PATCH | `/api/campaigns/config` | Update campaign configuration |
| GET | `/api/campaigns/preview` | Preview campaign contacts |
| POST | `/api/campaigns/send` | Send campaign |
| GET | `/api/campaigns/history` | Campaign send history |

### Jobs & Sync
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs` | List jobs |
| POST | `/api/jobs` | Create job |
| POST | `/api/sync/scraped-jobs` | Sync scraped job data |
| POST | `/api/webhook` | Receive scraper webhook |

Full reference: [docs/api-reference.md](docs/api-reference.md)

---

## Frontend

Built with React 19 + TypeScript + Tailwind CSS v4.

### Key Pages

| Route | Component | Description |
|---|---|---|
| `/` | Dashboard | Stats overview (jobs, companies, campaigns) |
| `/jobs` | JobsView + JobTable | Browse and filter job listings |
| `/companies` | OntarioCompanies | Ontario/Quebec company management |
| `/campaigns` | CampaignModule | Email campaign management |
| `/routes` | RouteManager | Visit route optimization |
| `/settings` | Settings | App settings, user management, export |

### Frontend Services

| File | Purpose |
|---|---|
| `src/services/apiClient.ts` | HTTP client with httpOnly cookie auth |
| `src/contexts/AuthContext.tsx` | Auth state management |
| `src/components/UI/Toast.tsx` | Toast notification system |

---

## Optimus_rutas Integration

Optimus_rutas is a Python FastAPI microservice for route optimization.

### How It Works

1. CanTrack saves route stops in PostgreSQL
2. Calls `POST /optimus/api/optimize` with stop coordinates
3. Optimus_rutas solves the Traveling Salesman Problem (TSP) using Mapbox
4. Returns ordered route with distances and estimated times

### Configuration

```env
OPTIMUS_URL=http://optimus-rutas:8000
```

The microservice source is in the `Optimus_rutas/` directory.

---

## Testing

```bash
npm test              # Run all tests (Vitest)
npm run test:watch    # Watch mode
```

Test files are co-located with source files:

```
server/application/auth/Login.test.ts     # Tests for Login use case
server/middleware/auth.middleware.test.ts  # Tests for auth middleware
server/services/ProviderChain.test.ts     # Tests for provider chain
```

### Test Infrastructure

- **Vitest** — Test runner
- **Supertest** — HTTP integration testing
- **Testcontainers** — PostgreSQL container for integration tests

---

## Deployment

### VPS Deployment

```bash
# 1. SSH into VPS
ssh root@187.124.237.242

# 2. Clone and configure
mkdir -p /var/www/cantrack && cd /var/www/cantrack
git clone https://github.com/Wizar-Cyber/CanTrack-CRM.git .
cp .env.example .env
# Edit .env with production values

# 3. Start with Docker
docker-compose up -d
```

### SSH Tunnel (for local development)

```bash
ssh -L 5434:127.0.0.1:5432 root@187.124.237.242 -N
```

Full reference: [docs/architecture/deployment.md](docs/architecture/deployment.md)

---

## Project Structure

```
cantrack/
├── server.ts                 # Entry point
├── server/                   # Backend
│   ├── application/          # Use cases
│   ├── domain/               # Entities & interfaces
│   ├── services/             # Business services + AI providers
│   ├── infrastructure/       # Database implementations
│   ├── middleware/            # Express middleware
│   ├── routes/               # API endpoints
│   ├── automation/           # Cron jobs
│   ├── lib/                  # Config, logger, validation
│   ├── data/                 # Static data
│   └── utils/                # Utilities
├── src/                      # Frontend
│   ├── components/           # React components
│   ├── contexts/             # React contexts
│   ├── services/             # API client
│   └── types.ts              # TypeScript types
├── db/                       # Database
├── scripts/                  # CLI utilities
├── docs/                     # Documentation
├── Optimus_rutas/            # Route optimization microservice
├── docker-compose.yml
└── Dockerfile
```

Full reference: [docs/folder-structure.md](docs/folder-structure.md)

---

## Documentation

| Document | Description |
|---|---|
| [Architecture Overview](docs/architecture/system-overview.md) | System architecture, components, data flow |
| [Deployment Guide](docs/architecture/deployment.md) | Docker, Nginx, VPS setup |
| [Dependency Map](docs/architecture/dependency-map.md) | Module dependencies and event flow |
| [Sequence Diagrams](docs/architecture/sequence-diagrams.md) | Auth, enrichment, campaign, geocoding flows |
| [Database Schema](docs/database.md) | Tables, relationships, migrations |
| [Authentication](docs/authentication.md) | JWT, roles, rate limiting, security |
| [API Reference](docs/api-reference.md) | All endpoints with request/response formats |
| [Configuration](docs/configuration.md) | Environment variables reference |
| [Cron Jobs](docs/cron-jobs.md) | Background job schedules and implementation |
| [Scraping](docs/scraping.md) | Data ingestion, webhooks, Playwright |
| [Coding Standards](docs/coding-standards.md) | Naming, architecture, conventions |
| [Contributing](docs/contributing.md) | Development workflow, PR process |
| [Security](docs/security.md) | Auth, data protection, best practices |
| [Performance](docs/performance.md) | Bottlenecks, optimization, monitoring |
| [Onboarding Guide](docs/onboarding.md) | Step-by-step developer setup |
| [Folder Structure](docs/folder-structure.md) | Complete directory tree with descriptions |

---

## Contributing

1. Create a feature branch
2. Follow [coding standards](docs/coding-standards.md)
3. Ensure `npm run lint` and `npm test` pass
4. Submit a PR with description

See [docs/contributing.md](docs/contributing.md) for detailed guidelines.

---

## Troubleshooting

### Database connection fails
```bash
psql -d "$DATABASE_URL" -c "SELECT 1"
npx tsx scripts/check-db.mjs
```

### CORS errors
Ensure `ALLOWED_ORIGINS` includes your frontend URL:
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### AI enrichment not working
Check API keys in `.env` and verify connectivity:
```bash
curl http://localhost:11434/api/tags  # Ollama
```

### TypeScript errors
```bash
npm run lint
```
Common: missing `.js` extension in ESM imports.

### Logs
```bash
docker-compose logs -f app        # Docker logs
pm2 logs                            # PM2 logs
```

---

## License

MIT
