# CanTrack CRM — System Architecture

## Overview

CanTrack CRM is a **Canadian-focused staffing agency management system** that tracks job applications, manages company intelligence, automates email marketing campaigns, and optimizes route planning for field visits. The system scrapes job portals, enriches company data via AI, and exports to Google Sheets/Excel.

## Core Capabilities

| Capability | Description |
|---|---|
| **Job Aggregation** | Scrapes job portals (Greenhouse, Lever, etc.) via webhooks |
| **Company Enrichment** | AI pipeline (Gemini → Groq → Ollama → WebSearch) to enrich company data |
| **Email Campaigns** | MDirector integration for segmented email marketing |
| **Route Optimization** | Microservice (Optimus_rutas) for visit route planning via Mapbox |
| **Data Export** | Google Sheets sync + Excel export |
| **Geocoding** | Background geocoding of company addresses via Mapbox/Nominatim |
| **CRM** | Full company, contact, job, application, and candidate management |

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Framer Motion |
| **Backend** | Express 4, TypeScript, tsx (runtime) |
| **Database** | PostgreSQL 17 (via CasaOS), `pg` driver |
| **AI/ML** | Google Gemini, Groq (llama-3.1-8b), Ollama (qwen2), DuckDuckGo/Wikipedia |
| **Email** | MDirector API (email marketing platform) |
| **Geocoding** | Mapbox Geocoding API + Nominatim (fallback) |
| **Routing** | Optimus_rutas (Python FastAPI microservice) |
| **Scraping** | Playwright (headless browser automation) |
| **Auth** | JWT (httpOnly cookies + Bearer header), bcrypt |
| **Infrastructure** | Docker, Docker Compose, Nginx |

## Architecture Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Vite)"]
        UI[React Components]
        AuthCtx[Auth Context]
        ApiClient[API Client]
    end

    subgraph Backend["Backend (Express + TypeScript)"]
        Routes[Route Handlers]
        Middleware[Auth / Rate Limit / Audit / Error]
        UseCases[Application Use Cases]
        Domain[Domain Entities]
        Services[Services]
        Providers[AI Providers Chain]
    end

    subgraph Database["PostgreSQL 17"]
        Tables[(companies, jobs, users,
                ontario_companies, quebec_companies,
                campaigns, routes, etc.)]
    end

    subgraph Microservices["Microservices"]
        Optimus[Optimus_rutas - Route Optimization]
        Ollama[Ollama - Local LLM]
    end

    subgraph External["External Services"]
        Gemini[Google Gemini AI]
        Groq[Groq AI]
        MDirector[MDirector Email]
        Mapbox[Mapbox Geocoding]
        Sheets[Google Sheets]
        Scrapers[Job Portal Scrapers]
    end

    Frontend -->|HTTP /api| Backend
    Backend -->|SQL| Database
    Backend -->|HTTP| Optimus
    Backend -->|HTTP| Gemini
    Backend -->|HTTP| Groq
    Backend -->|HTTP| Ollama
    Backend -->|HTTP| MDirector
    Backend -->|HTTP| Mapbox
    Backend -->|HTTP| Sheets
    Backend <--|Webhook| Scrapers
    Backend -->|Playwright| Scrapers
```

## Key Files Reference

| File | Purpose |
|---|---|
| `server.ts` | Application entry point, Express setup, route registration, migrations |
| `server/lib/config.ts` | Centralized environment configuration |
| `server/lib/logger.ts` | Pino-based structured logging |
| `server/middleware/auth.middleware.ts` | JWT verification + role-based authorization |
| `server/automation/cron-jobs.ts` | Background jobs (geocoding, enrichment, campaigns, workflow) |
| `server/services/providers/ProviderChain.ts` | AI provider chain with fallback logic |
| `src/App.tsx` | Frontend root with routing, enrichment queue, data fetching |
| `src/services/apiClient.ts` | HTTP client with cookie-based auth |
| `db/schema.sql` | Full database schema definition |
