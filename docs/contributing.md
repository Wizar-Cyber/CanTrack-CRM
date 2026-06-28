# Contributing Guide

## Development Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in values
3. Install dependencies: `npm install`
4. Start development: `npm run dev`

## Development Workflow

1. **Code** — Write code following coding standards
2. **Type check** — `npm run lint` (tsc --noEmit)
3. **Test** — `npm test` (vitest)
4. **Verify** — Start server with `npm run dev` and test manually

## Pull Request Process

1. Create feature branch from `main`
2. Make changes following coding standards
3. Add/update tests as needed
4. Run `npm run lint` and `npm test` — both must pass
5. Submit PR with description of changes

## Code Review Guidelines

- Verify architectural consistency
- Check for security issues (SQL injection, XSS, auth bypass)
- Ensure error handling is comprehensive
- Validate that tests cover new functionality
- Confirm documentation is updated

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

Test files co-locate with source files using `.test.ts` suffix.

## Commit Conventions

Use conventional commits:

```
feat: add company enrichment queue
fix: correct geocoding timeout handling
docs: add deployment guide
refactor: extract provider chain pattern
test: add auth middleware tests
chore: update dependencies
```

## Project Decisions

### Why in-process cron instead of external scheduler?
Simplicity. The `setInterval`-based approach works for single-instance deployment and avoids external dependencies (Redis, Bull, etc.). If horizontal scaling is needed, migrate to a job queue.

### Why dual data sources (companies + ontario/quebec tables)?
Migration strategy: The system started with Google Sheets as source of truth (`companies` table), then added direct database ingestion (`ontario_companies`/`quebec_companies`). Both coexist with `companies` acting as enriched cache and province tables as the operational data store.

### Why AI provider chain?
Resilience and cost. Gemini is primary (best quality), Groq as fast/cheap fallback, Ollama for air-gapped/offline operation, WebSearch as last resort.
