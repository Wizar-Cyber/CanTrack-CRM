# Coding Standards

## Language & Runtime

- **TypeScript** for all backend and frontend code
- **ES2022** target with ESNext modules
- `tsx` runtime for development (no build step)

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files (backend) | kebab-case | `auth.middleware.ts`, `enrichment.service.ts` |
| Files (frontend) | PascalCase | `CompanyDetail.tsx`, `CampaignModule.tsx` |
| Classes | PascalCase | `EnrichmentService`, `ProviderChain` |
| Functions | camelCase | `enrichCompany()`, `signToken()` |
| Interfaces | PascalCase with `I` prefix | `ICompanyRepository`, `IEnrichmentProvider` |
| Types | PascalCase | `JwtPayload`, `AuthRequest` |
| Enums | PascalCase | `RouteStatus`, `StopStatus` |
| Constants | UPPER_SNAKE_CASE | `GEOCODING_BATCH`, `WORKFLOW_HOURS_UTC` |
| Variables | camelCase | `pool`, `config`, `companyName` |
| Directories | kebab-case | `province-helpers/`, `email-campaign/` |

## Architecture Principles

### Dependency Direction

```
Routes → Use Cases → Domain (entities + interfaces)
                  → Services → External APIs
                  → Infrastructure (repositories)
```

### Layer Rules

- **Domain layer** has zero dependencies on infrastructure
- **Application layer** depends on domain interfaces, not implementations
- **Infrastructure layer** implements domain interfaces
- **Services** encapsulate external integration complexity

## Code Documentation

Every public API must have TSDoc:

```typescript
/**
 * Signs a JWT token for the given user payload.
 *
 * @param payload - User identity for the token
 * @returns Signed JWT string
 *
 * @throws {Error} If JWT_SECRET is not configured
 */
export function signToken(payload: JwtPayload): string {
```

## Import Order

1. External dependencies (npm packages)
2. Internal modules (project files)
3. Types

```typescript
import express from 'express';
import jwt from 'jsonwebtoken';

import { AuthRequest } from '../middleware/auth.middleware.js';
import { env } from '../lib/config.js';
```

## Error Handling

- Use `DomainError` for domain-level errors
- Express error middleware catches unhandled errors
- Log all errors with structured logger
- Never expose stack traces to clients

## Testing

- Vitest for both backend and frontend tests
- Test files co-located with source: `Login.test.ts` → `Login.ts`
- Prefer integration tests for routes (supertest)
- Unit tests for domain logic and utilities

## Security

- Never commit `.env` or credentials
- Use parameterized queries (never string interpolation for SQL)
- Validate all input with column allowlists
- Apply rate limiting to auth endpoints
- Use httpOnly cookies for token storage
