# Routes (API Endpoints)

HTTP endpoint definitions. Each router is a factory function receiving the PostgreSQL pool.

## Endpoints

| Router | File | Base Path | Auth |
|---|---|---|---|
| Auth | `auth.routes.ts` | `/api/auth` | Public + Admin |
| Companies | `companies.routes.ts` | `/api/companies` | Authenticated |
| Jobs | `jobs.routes.ts` | `/api/jobs` | Authenticated |
| Campaign | `campaign.routes.ts` | `/api/campaigns` | Admin/Editor |
| Candidates | `candidates.routes.ts` | `/api/candidates` | Authenticated |
| Applications | `applications.routes.ts` | `/api/applications` | Authenticated |
| Sync | `sync.routes.ts` | `/api/sync` | Authenticated |
| Enrichment | `enrichment.routes.ts` | `/api/enrichment` | Authenticated |
| Export | `export.routes.ts` | `/api/export` | Authenticated |
| Webhook | `webhook.routes.ts` | `/api/webhook` | Shared secret |
| Health | `health.routes.ts` | `/api/health` | Public |
| Ontario | `ontario.routes.ts` | `/api/ontario` | Authenticated |
| Service Templates | `service-templates.routes.ts` | `/api/service-templates` | Admin |
| Visits | `visits.routes.ts` | `/api/visits` | Authenticated |
| Workflow | `workflow.routes.ts` | `/api/workflow` | Admin |

## Pattern

```typescript
export function createRouter(pool: Pool): Router {
  const router = Router();
  const requireAuth = createRequireAuth(pool);
  // Define routes...
  return router;
}
```

## Registration

All routers are dynamically imported and registered in `server.ts`:

```typescript
const { createCompaniesRouter } = await import('./server/routes/companies.routes.js');
app.use('/api', createCompaniesRouter(pool));
```
