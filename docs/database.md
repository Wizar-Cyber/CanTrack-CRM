# Database Documentation

## Overview

PostgreSQL 17 database managed by CasaOS. Single database `casaos` shared by CanTrack CRM and Optimus_rutas.

## Connection

```
DATABASE_URL=postgresql://casaos:casaos@postgresql:5432/casaos
```

## Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ email_logs : sends
    users ||--o{ application_queue : creates
    users ||--o{ routes : creates

    companies ||--o{ jobs : has
    companies ||--o{ email_logs : receives
    companies ||--o{ route_stops : visited
    companies ||--o{ email_campaign_log : targeted

    jobs ||--o{ applications : receives
    jobs ||--o{ application_queue : queued
    jobs ||--o{ job_required_skills : requires

    candidates ||--o{ candidate_skills : has
    candidates ||--o{ applications : submits

    routes ||--o{ route_stops : contains

    ontario_companies ||--o{ jobs : linked_via
    quebec_companies ||--o{ jobs : linked_via
```

## Core Tables

### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK, auto-generated |
| email | VARCHAR(255) | Unique, lowercase |
| password_hash | VARCHAR(255) | bcrypt |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| role | VARCHAR(20) | admin, editor, viewer |
| is_active | BOOLEAN | Default true |

### `companies`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | Company name |
| slug | VARCHAR(255) | URL-safe name |
| industry | TEXT | Enriched |
| company_size | VARCHAR(50) | Enriched |
| website | TEXT | Enriched |
| enrichment_status | VARCHAR(30) | pending, processing, scraped, failed, db_matched |
| tipo | company_tipo | verde, naranja, morado, rojo |

### `jobs`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| title | VARCHAR(255) | Job title |
| company_id | UUID | FK → companies |
| url | TEXT | Job posting URL |
| source | VARCHAR(50) | greenhouse, lever, webhook, etc. |
| service_type_id | VARCHAR(30) | Classified service type |
| province_id | UUID | FK → ontario_companies or quebec_companies |

### `ontario_companies` / `quebec_companies`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| nombre | TEXT | Company name |
| telefono | TEXT | |
| correo | TEXT | Email |
| direccion | TEXT | Address |
| work | TEXT | Service type label |
| enrichment_status | VARCHAR(50) | pending, processing, scraped, failed |
| lat/lng | DOUBLE PRECISION | Geocoded coordinates |

### `campaign_config`

Single-row configuration table for email campaigns.

### `email_campaign_log`

Audit log of all sent email campaigns.

### `routes` / `route_stops`

Visit route planning tables (see Optimus_rutas integration).

## Migrations

Located in `db/migrations/`:

| File | Purpose |
|---|---|
| `003_triggers_and_indexes.sql` | Performance indexes |
| `004_normalize_addresses.sql` | Address normalization |
| `005_fix_address_assignments.sql` | Address assignment fixes |
| `006_fulltext_indexes.sql` | Full-text search indexes |

Auto-migrations run on startup in `server.ts:runMigrations()` — idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements.
