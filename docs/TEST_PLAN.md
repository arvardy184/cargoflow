# CargoFlow — Test Plan and Results

## Strategy

| Layer              | Tool                             | Scope                                                                                                                                                                       | Database                      |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| API unit           | Jest + ts-jest                   | Domain rules (state machine, editing rules, route/ETA, overdue, on-time rate, KPIs, ISO 6346), guards, env validation, error filter, body-parser mapping, DTO validation    | none                          |
| API integration    | Jest + Supertest                 | Full Nest app over HTTP: auth, RBAC, CRUD, lifecycle, history, audit, filters/pagination, concurrency, transactional rollback, HTTP pipeline                                | MySQL `cargoflow_test`        |
| Web unit/component | Vitest + Testing Library (jsdom) | Form schemas, API client error handling, server-error mapping, status display, shipment list rendering, login form, create form, transition controls, role-based navigation | none (fetch mocked per route) |
| End-to-end         | Playwright (Chromium)            | Login → create shipment → book → depart → deliver → timeline; OPERATIONS denied the audit log (UI and API)                                                                  | MySQL `cargoflow` (seeded)    |

Principles:

- **Business rules are tested where they live.** The domain functions are pure, so every
  transition pair (16 combinations) and boundary (ETA exactly now, delivery exactly at ETA, zero
  deliveries) is unit-tested directly.
- **Persistence behavior is tested against real MySQL**, not mocks: locking, isolation, unique
  constraints and rollback only show up on the real engine.
- **Time is pinned.** Integration tests inject `FixedClock` (`2030-01-15T08:00Z`). Web schema tests inject `now`.
- **Test-database safety.** The integration harness refuses any `TEST_DATABASE_URL` whose database
  name doesn't end in `_test`, because it deletes all rows between tests.

## Critical scenarios

| Scenario                                                                                                                 | Where                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Login success sets an httpOnly, SameSite=Lax cookie and returns a token; email is case-insensitive                       | `test/integration/auth.int-spec.ts`                                    |
| Unknown email and wrong password return the same 401 message                                                             | same                                                                   |
| Missing, tampered, expired, wrong-secret and `alg: none` tokens → 401                                                    | `auth.int-spec.ts`, `src/auth/guards.spec.ts`                          |
| Login rate limit → 429 after the limit, other routes unaffected                                                          | `auth.int-spec.ts`                                                     |
| OPERATIONS → 403 on customer create/update and audit log                                                                 | `customers-containers.int-spec.ts`, `dashboard-audit.int-spec.ts`, E2E |
| OPERATIONS → 403 `FORBIDDEN_FIELD` when reassigning a draft's customer; ADMIN allowed                                    | `shipments.int-spec.ts`                                                |
| Create → DRAFT, number `CF-<clock year>-00001`, one event, one audit record                                              | `shipments.int-spec.ts`                                                |
| Client-supplied `status` on create is rejected (mass assignment)                                                         | `shipments.int-spec.ts`, `validation.spec.ts`                          |
| Invalid route / past ETA / unknown customer or container → 400 and no sequence number consumed                           | `shipments.int-spec.ts`                                                |
| Full lifecycle with remarks, `actualDeliveryAt` from the clock, ON_TIME vs LATE                                          | `shipment-lifecycle.int-spec.ts`                                       |
| Skip, reverse, repeat and post-terminal transitions → 409 with no event or audit written                                 | same                                                                   |
| **5 concurrent identical transitions → exactly one 200**, one event, one audit                                           | same                                                                   |
| **Audit write failure rolls back status and event** (single transaction)                                                 | same                                                                   |
| Concurrent edits → each applied edit audited; the rest get 409 `CONCURRENT_MODIFICATION`                                 | same                                                                   |
| **5 concurrent creates for one container → exactly one 201**                                                             | `shipments.int-spec.ts`                                                |
| Concurrent creates for different containers → unique, gap-free numbers, no deadlock                                      | same                                                                   |
| Editing rules per status (DRAFT / BOOKED / DELIVERED), no-op edits not audited, notes cleared with `null`                | same                                                                   |
| List pagination metadata, filters (status, customer, overdue true/false, number search), ETA sort both directions        | same                                                                   |
| Dashboard KPIs, attention list (OVERDUE vs DUE_SOON), recent activity; empty-database case (`onTimeDeliveryRate: null`)  | `dashboard-audit.int-spec.ts`                                          |
| Audit log newest first, actor and entity labels, filters, no credentials in snapshots                                    | same                                                                   |
| Malformed JSON → 400, body > 100 kB → 413, bad charset → 415 (previously leaked parser text / returned 500)              | `http-pipeline.int-spec.ts`                                            |
| Security headers, CORS allow-list, 404 format, OpenAPI document                                                          | same                                                                   |
| Web: client validation messages, server field errors mapped onto inputs, 401/429 login messages, safe `?next=` redirects | `apps/web/src/**/*.test.ts(x)`                                         |
| Web: transition buttons come only from `allowedTransitions`; 409 shown inside the dialog                                 | `transition-controls.test.tsx`                                         |

## Edge cases covered

- ETA exactly equal to now (rejected); delivery exactly at ETA (on time).
- On-time rate with 0 deliveries (`null`, shown as "No deliveries yet"), 0%, 100%, rounding (66.7, 12.5).
- Origin/destination equal after trimming, case-folding and collapsing spaces.
- ISO 6346: wrong check digit, wrong length, invalid category letter, spacing/dash/case normalization, J/Z categories.
- Container freed after delivery can be reassigned.
- Editing a shipment onto its own container is allowed; onto a busy container is rejected.
- Token for a deleted user → 401 on `/auth/me`.
- Mobile layout: no horizontal page scroll on any page at 390 px (checked with Playwright during development).

## Commands

```bash
# MySQL reachable on localhost:3307 with cargoflow and cargoflow_test databases
pnpm --filter @cargoflow/api test               # API unit
pnpm --filter @cargoflow/api test:integration   # API integration (uses TEST_DATABASE_URL)
pnpm --filter @cargoflow/web test               # web unit/component
pnpm --filter @cargoflow/web exec playwright install chromium   # once
pnpm test:e2e                                   # starts API + web if not running; needs a seeded cargoflow DB
pnpm lint && pnpm typecheck && pnpm build       # static checks and production builds
```

## Verified results (2026-11-25, Windows 11, Node 26, MySQL 8.4)

| Check                                                                   | Result                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm format:check`                                                     | pass                                                               |
| `pnpm lint` (api + web, `--max-warnings=0`)                             | pass                                                               |
| `pnpm typecheck` (api + web)                                            | pass                                                               |
| API unit                                                                | **98 passed** (7 suites)                                           |
| API integration                                                         | **67 passed** (6 suites); shipment suites re-run 5× without flakes |
| Web unit/component                                                      | **54 passed** (9 files)                                            |
| E2E                                                                     | **2 passed** (Playwright started both servers itself)              |
| `pnpm build` (Nest + Next.js production)                                | pass                                                               |
| Manual smoke test of the running API (33 HTTP checks, rate limit, CORS) | pass                                                               |

GitHub Actions (`.github/workflows/ci.yml`) runs the same commands in three jobs. The workflow
had not run on GitHub at the time of writing: the repository had no commits or remote yet.

## Defects found by testing

| Defect                                                                                      | Found by                    | Fix                                                                           |
| ------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Concurrent creates could assign one container to several active shipments                   | Integration (concurrency)   | Container-assigning transactions at READ COMMITTED (ADR 0003)                 |
| First fix (`FOR SHARE`) deadlocked creates for different containers                         | Integration (concurrency)   | Replaced by the isolation-level fix                                           |
| Malformed JSON leaked the parser message; 413/415 returned 500                              | Smoke test                  | Body-parser error middleware + filter fallback                                |
| Validation message cited an invalid ISO 6346 example                                        | Unit                        | Corrected to `MSCU1234566`                                                    |
| Phone validation message claimed a leading bracket was allowed                              | Web unit                    | Message corrected (API and web)                                               |
| Dashboard and shipment list overflowed horizontally on mobile                               | Playwright screenshot check | `min-w-0` grid children; table wrapper as containing block for `sr-only` text |
| Audit entries showed "— →" for values that only exist after a change, in random field order | Visual review               | Show the single value; fixed field order                                      |

## Known gaps

- No automated accessibility scan (axe). Keyboard and labeling were checked by hand and through
  role-based test queries.
- No load or performance tests; the EXPLAIN plans are the only performance evidence
  (`pnpm --filter @cargoflow/api db:explain`).
- E2E covers the main happy path and one authorization case, not every page.
- The E2E test creates data in the development database; re-run the seed to reset it.
- Visual regression is not automated.
