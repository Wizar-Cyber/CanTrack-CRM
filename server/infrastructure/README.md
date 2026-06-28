# Infrastructure Layer

Implementations of domain repository interfaces and external I/O.

## Database Repositories

| Repository | File | Table | Implements |
|---|---|---|---|
| BaseRepository | `BaseRepository.ts` | — | Abstract base with CRUD |
| CompanyRepository | `CompanyRepository.ts` | `companies` | ICompanyRepository |
| JobRepository | `JobRepository.ts` | `jobs` | IJobRepository |
| UserRepository | `UserRepository.ts` | `users` | IUserRepository |
| CandidateRepository | `CandidateRepository.ts` | `candidates` | ICandidateRepository |
| ApplicationRepository | `ApplicationRepository.ts` | `applications` | IApplicationRepository |
| ProvinceCompanyRepository | `ProvinceCompanyRepository.ts` | `ontario_companies`/`quebec_companies` | — |

## Database Connection

Configured in `server/lib/config.ts`:
```typescript
export const db = {
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  }),
};
```

Pool is shared across the application via dependency injection through route factory functions.
