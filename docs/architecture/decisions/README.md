# Architecture Decision Records

## ADR-001: In-Process Cron Jobs

**Decision**: Use `setInterval` for background jobs instead of external schedulers.

**Context**: Single-instance deployment on VPS. No need for distributed job processing.

**Consequences**:
- Simplifies deployment (no Redis/Bull/Redis required)
- Jobs restart with the server
- If horizontal scaling needed, migrate to Bull/Redis or external cron

## ADR-002: AI Provider Chain Pattern

**Decision**: Chain-of-responsibility pattern for AI enrichment providers.

**Context**: Multiple AI providers with different quality/cost characteristics.

**Consequences**:
- Fallback: Gemini → Groq → Ollama → WebSearch
- Each provider fills missing fields only
- Provider availability checked before each enrichment
- Easy to add/remove providers

## ADR-003: Dual Data Sources

**Decision**: Maintain both `companies` table and `ontario_companies`/`quebec_companies` tables.

**Context**: System migrated from Google Sheets as primary source to direct database ingestion.

**Consequences**:
- `companies` acts as enriched cache for legacy Sheet data
- `ontario_companies`/`quebec_companies` are the operational data stores
- Province tables have different schema (Spanish column names)
- Migration scripts reconcile data between sources

## ADR-004: httpOnly Cookie Auth

**Decision**: Store JWT in httpOnly cookie with Bearer header fallback.

**Context**: SPA frontend with API backend on same domain.

**Consequences**:
- XSS-resistant token storage
- Automatic cookie send with credentials: 'include'
- API client (`apiClient.ts`) reads cookies via browser
- Bearer header available for non-browser clients

## ADR-005: Co-located Tests

**Decision**: Test files next to source files, e.g., `Login.test.ts` next to `Login.ts`.

**Context**: Vitest test runner with TypeScript.

**Consequences**:
- Easy to find and maintain tests
- No separate test directory structure
- Clear visibility into test coverage per module
