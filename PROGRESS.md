# CargoFlow — Implementation Progress

_Last updated: 2026-11-25_

Requirements: `docs/SPEC.md`.

## Done (verified)

- Monorepo foundation: pnpm workspace, Prettier, EditorConfig, `.gitignore`, `docker-compose.yml` (MySQL 8.4 on host port 3307), `infrastructure/mysql/init` (creates `cargoflow_test`).
- `apps/api` (NestJS 11, Prisma 6.19, TS 5.9 strict):
  - Prisma schema + initial migration — applied to `cargoflow` and `cargoflow_test`.
  - Modules: core (env + Clock), prisma, auth (JWT cookie/bearer, global JwtAuthGuard + RolesGuard, login throttling), customers, containers (ISO 6346 validation), shipments (state machine, editing rules, CAS transitions, container row locks, sequence numbers), dashboard (MySQL aggregation), audit, health.
  - Global exception filter + structured validation errors; Swagger at `/api/docs`.
  - Seed ran: 2 users, 10 customers, 24 containers, 40 shipments, 123 events, 157 audit records.
- **Smoke test** of the running API (33 checks: auth, RBAC, validation, lifecycle, filters, Swagger) plus rate limiting and CORS — all pass.
- **Bugs found and fixed during testing:**
  - Body-parser errors: malformed JSON leaked the raw `JSON.parse` message; oversized (413) and bad-charset (415) bodies returned 500. Now mapped by `common/errors/body-parser-errors.ts` (Express error middleware + filter fallback).
  - **Container double-assignment race:** 5 concurrent creates for one container all succeeded (the REPEATABLE READ snapshot predated the row-lock wait). Fixed by running container-assigning transactions at READ COMMITTED; a `FOR SHARE` alternative was tried and deadlocked on gap locks. Covered by integration test.
  - Wrong ISO 6346 example in the validation message (`MSCU1234565` → `MSCU1234566`).
- **API tests:** 98 unit + 67 integration against `cargoflow_test` — all pass; shipment suites re-run 5× without flakes.
- **ESLint** flat configs (API type-aware; web `eslint-config-next`); lint, typecheck and Prettier clean repo-wide.
- **`apps/web`** (Next.js 16.4, React 19, Tailwind 4, Radix/shadcn-style UI, TanStack Query, RHF + Zod 4): login, dashboard (KPI strip, status pipeline, needs-attention, recent activity), shipment list (URL-state filters), create, detail (lifecycle rail, confirm-and-remark transitions, edit dialog limited to `editableFields`, timeline, admin audit trail), customers (admin add/edit), containers (register, availability), audit log (admin). `src/proxy.ts` route guard; `/api/*` rewrite to the API; global 401 → clear cookie → `/login?reason=expired`.
  - Visually reviewed with Playwright screenshots (desktop + 390px mobile); no console errors; no horizontal scroll on any page.
  - Fixed during review: mobile overflow (grid `min-w-0`; `sr-only` text escaping the table scroll container), audit field order / "— →" display.
- **Web tests:** 54 Vitest + RTL tests; **E2E:** 2 Playwright tests (login → create → book → depart → deliver → timeline; OPS denied audit log) — pass, including Playwright starting both servers itself.
- **Production builds** (`pnpm build`) pass; `pnpm dev` verified (both apps up, proxy + guard work).
- **`prisma/explain.ts`** (`db:explain`) prints EXPLAIN plans; results documented in ARCHITECTURE.md.
- **Docs:** README, BRD, PRD, ARCHITECTURE, ERD, API, TEST_PLAN, ADR 0001–0003, screenshots in `docs/screenshots/`.
- **CI:** `.github/workflows/ci.yml` (quality / integration with MySQL service / E2E). Not yet run on GitHub — remote URL pending.
- Initial git commit includes the implementation, tests, documentation, and CI workflow.

## Next

1. Configure the GitHub remote, push the initial commit, then confirm the CI workflow passes there.
2. Optional hardening (see README "Limitations"): `(status, createdAt)` index, generated-column unique index for active container, CSP, CSRF token, axe checks in CI.
3. Laravel quotation module — deferred unless PHP becomes available (none installed locally).

## Decisions

- Versions: NestJS 11, Prisma 6.19, TypeScript 5.9 (not the brand-new Nest 12 / Prisma 8-rc / TS 7).
- Docker Desktop must be running before `docker compose up`.
- `apps/api/.env` is local only (generated JWT secret); never committed.

## Domain/design decisions already implemented (keep consistent)

- **Auth:** JWT in httpOnly `cargoflow_session` cookie (SameSite=Lax) for the web app; also accepted as `Authorization: Bearer`. Login also returns `accessToken` in body for API clients. Web app should call the API same-origin via Next.js rewrites (`/api/*` → `http://localhost:4000/api/*`). `POST /api/auth/logout` clears the cookie. Login throttled per IP (`LOGIN_RATE_LIMIT_PER_MINUTE`).
- **Editing rules** (`shipments/domain/shipment-lifecycle.ts`): DRAFT → all fields editable, but `customerId` is ADMIN-only; BOOKED/IN_TRANSIT → only `estimatedDeliveryAt` + `notes`; DELIVERED → read-only (`SHIPMENT_LOCKED`). Any new/revised ETA must be in the future.
- **Container rule:** a container can be on only one undelivered shipment at a time (`CONTAINER_UNAVAILABLE`); enforced with `SELECT … FOR UPDATE` on the container row inside a READ COMMITTED transaction (`CONTAINER_ASSIGNMENT_TX`).
- **Concurrency:** status change uses `updateMany WHERE id AND status=<current>` → 0 rows = 409 `CONCURRENT_MODIFICATION`. Field edits also compare `updatedAt`.
- **Shipment numbers:** `CF-<year>-<5 digits>` from `SequenceCounter` table (extra entity) via `INSERT … ON DUPLICATE KEY UPDATE`.
- **Detail response** includes `allowedTransitions`, `editableFields`, `isOverdue`, `deliveryPerformance` → frontend must render controls from these, not re-implement rules.
- **Dashboard:** active = BOOKED + IN_TRANSIT; on-time rate = round(onTime / delivered × 100, 1), `null` when delivered = 0; "attention" = undelivered with ETA < now + 48h.
- **Error body:** `{ statusCode, error, code, message, details?, path, timestamp }`. Codes in `common/errors/domain-error.ts`; validation errors → `VALIDATION_ERROR` with `details: [{ field, messages }]`. Body-parser failures → `MALFORMED_REQUEST_BODY` / `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE`.
- **Roles:** customers POST/PATCH = ADMIN only; containers POST = both roles; audit-logs = ADMIN only.
- **Clock:** inject `Clock` (`common/clock.ts`); use `FixedClock` in tests. No separate `users` module (auth reads users directly).
- **Tests:** integration harness `apps/api/test/integration/harness.ts` refuses any DB whose name doesn't end in `_test`; fixed clock `2030-01-15T08:00Z`.
- **Demo accounts (dev only):** `admin@cargoflow.local`, `ops@cargoflow.local`, password = `SEED_DEMO_PASSWORD` in `apps/api/.env` (example value `CargoFlow!2026`).

## Environment notes

- Running Docker commands from Claude Code has repeatedly crashed the session. Start Docker Desktop and run `docker compose up -d mysql` manually before a session.
- GitHub remote URL has not been configured; push and CI verification are pending.
- Windows: stopping a background `pnpm start`/`pnpm dev` task leaves the child `node` process holding ports 3000/4000. Free them with `netstat -ano | findstr :3000` + `taskkill /PID <pid> /T /F` before rebuilding `.next`.
- E2E needs Chromium once: `pnpm --filter @cargoflow/web exec playwright install chromium`. E2E creates data in the dev DB; re-run `db:seed` to reset.

## Resume commands

```bash
cd cargoflow
docker compose up -d mysql
pnpm install
pnpm --filter @cargoflow/api db:deploy
pnpm --filter @cargoflow/api db:seed
pnpm dev            # API http://localhost:4000/api/docs + web http://localhost:3000
pnpm test           # API + web unit tests
pnpm test:integration
pnpm test:e2e
pnpm lint && pnpm typecheck && pnpm build && pnpm format:check
```
