# Developer Onboarding Guide

## Prerequisites

- Node.js 22+
- npm
- PostgreSQL 17 (local or CasaOS)
- Docker & Docker Compose (for full stack)
- Git

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url> cantrack
cd cantrack
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum:
- `DATABASE_URL` — point to your PostgreSQL
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 3. Initialize Database

```bash
# Option A: Via psql
psql -d yourdb -f db/schema.sql
psql -d yourdb -f db/seed.sql

# Option B: Via script
npm run init-db
```

### 4. Start Development

```bash
npm run dev
```

Server starts at `http://localhost:3000`. The first visit will prompt for admin setup.

### 5. First-Time Setup

1. Open `http://localhost:3000/setup`
2. Create admin account
3. Configure MDirector and AI keys in settings

## Available Scripts

| Script | Command | Description |
|---|---|---|
| dev | `tsx server.ts` | Start dev server |
| build | `vite build` | Build for production |
| test | `vitest run` | Run all tests |
| test:watch | `vitest` | Watch mode |
| lint | `tsc --noEmit` | TypeScript check |
| clean | `rm -rf dist` | Clean build artifacts |

## Database Migrations

Auto-migrations run on server startup (idempotent). Manual migrations in `db/migrations/`:

```bash
psql -d yourdb -f db/migrations/003_triggers_and_indexes.sql
```

## Running with Docker

```bash
docker-compose up -d
```

This starts:
- CanTrack CRM on `:3000`
- Optimus_rutas on `:8000`
- Ollama on `:11434`

## Running Background Jobs

Background jobs start automatically with the server:
- Geocoding: every 60 minutes
- Enrichment: every 8 seconds (5 companies)
- Fast Sync: every 5 minutes
- Campaign Automation: checks every 15 minutes
- Workflow: checks every 15 minutes, runs at 08:00/20:00 UTC

## Common Tasks

### Enrich Companies Manually

```bash
npx tsx scripts/enrich-companies.ts
```

### Export to Excel

```bash
npx tsx scripts/export-to-excel.ts
```

### Export to Google Sheets

```bash
npx tsx scripts/export-to-sheets.ts
```

### Check Database Status

```bash
npx tsx scripts/check-status.ts
```

## Troubleshooting

### Database Connection Fails

```bash
# Check if PostgreSQL is running
psql -d your_connection_string -c "SELECT 1"

# Test via script
npx tsx scripts/check-db.mjs
```

### CORS Errors

Ensure `ALLOWED_ORIGINS` includes your frontend URL:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### AI Enrichment Not Working

Check your API keys:

```bash
# Test Gemini
curl -X POST -H "Content-Type: application/json" \
  -d '{"companyId":"test","companyName":"Test Corp"}' \
  http://localhost:3000/api/gemini/enrich
```

### TypeScript Errors

```bash
npm run lint
```

Common issues:
- Missing `.js` extension in imports (required by ESM + tsx)
- Type mismatches in dynamic SQL

## Architecture Overview

```
Frontend (React) ↔ API (Express) ↔ PostgreSQL
                        ↕
              AI Providers (Gemini/Groq/Ollama)
                        ↕
              External Services (MDirector, Google Sheets, Mapbox)
```

See `docs/architecture/system-overview.md` for detailed architecture.
