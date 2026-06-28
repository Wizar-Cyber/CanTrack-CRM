# Domain Layer

Core business entities and repository interfaces. This layer has **zero dependencies** on infrastructure.

## Modules

| Module | Entity | Repository Interface | Purpose |
|---|---|---|---|
| `company/` | `Company` | `ICompanyRepository` | Business/Customer profiles |
| `job/` | `Job` | `IJobRepository` | Job listings from portals |
| `user/` | `User` | `IUserRepository` | System users |
| `candidate/` | `Candidate` | `ICandidateRepository` | Job seekers |
| `application/` | `Application` | `IApplicationRepository` | Job applications |
| `shared/` | `DomainError` | — | Base error classes |

## Principles

- Pure TypeScript types and interfaces
- No imports from infrastructure or services layers
- Repository interfaces define the contract for data access
- Domain errors extend `DomainError` with HTTP status codes
