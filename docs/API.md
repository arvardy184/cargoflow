# CargoFlow — API Guide

Base URL (local): `http://localhost:4000/api`. Interactive docs: **Swagger UI at
`http://localhost:4000/api/docs`**, raw OpenAPI JSON at `/api/docs-json`.

The web app calls the same endpoints through its own origin (`http://localhost:3000/api/*`,
proxied by Next.js).

## Authentication

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ops@cargoflow.local","password":"<SEED_DEMO_PASSWORD>"}'
```

```json
{
  "user": {
    "id": "cm…",
    "fullName": "Bima Santoso",
    "email": "ops@cargoflow.local",
    "role": "OPERATIONS"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "expiresAt": "2026-11-25T17:00:00.000Z"
}
```

The response also sets the `cargoflow_session` httpOnly cookie (used by browsers). Scripts send
the token as a header:

```bash
TOKEN=…   # accessToken from the login response
curl -s http://localhost:4000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

Demo accounts (development only): `admin@cargoflow.local` (ADMIN) and `ops@cargoflow.local`
(OPERATIONS). The password is `SEED_DEMO_PASSWORD` from `apps/api/.env`.

## Endpoints

| Method | Path                    | Roles  | Notes                                                                 |
| ------ | ----------------------- | ------ | --------------------------------------------------------------------- |
| POST   | `/auth/login`           | public | Rate limited per IP (default 10/min)                                  |
| POST   | `/auth/logout`          | public | Clears the cookie (204)                                               |
| GET    | `/auth/me`              | any    | Current user                                                          |
| GET    | `/health`               | public | `{ status, database }`                                                |
| GET    | `/dashboard/summary`    | any    | KPIs, needs-attention list, recent activity                           |
| GET    | `/shipments`            | any    | Paginated list (query below)                                          |
| POST   | `/shipments`            | any    | Creates a DRAFT                                                       |
| GET    | `/shipments/:id`        | any    | Detail incl. `allowedTransitions` and `editableFields` for the caller |
| PATCH  | `/shipments/:id`        | any    | Field edits; allowed fields depend on status and role                 |
| PATCH  | `/shipments/:id/status` | any    | `{ status, remarks? }`; next status only                              |
| GET    | `/shipments/:id/events` | any    | Status history, oldest first                                          |
| GET    | `/customers`            | any    | `?search=&page=&pageSize=`                                            |
| GET    | `/customers/:id`        | any    |                                                                       |
| POST   | `/customers`            | ADMIN  |                                                                       |
| PATCH  | `/customers/:id`        | ADMIN  |                                                                       |
| GET    | `/containers`           | any    | `?search=&containerType=&available=true\|false`                       |
| POST   | `/containers`           | any    | ISO 6346 number with valid check digit                                |
| GET    | `/audit-logs`           | ADMIN  | `?entityType=&entityId=&action=&actorId=`                             |

"any" means any authenticated user (ADMIN or OPERATIONS).

### Shipment list query

| Parameter              | Values                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| `page`, `pageSize`     | `pageSize` 1–100, default 20                                               |
| `search`               | Shipment number contains (case-insensitive)                                |
| `status`               | `DRAFT`, `BOOKED`, `IN_TRANSIT`, `DELIVERED`                               |
| `customerId`           | Customer id                                                                |
| `overdue`              | `true` / `false`                                                           |
| `sortBy` / `sortOrder` | `createdAt` (default) or `estimatedDeliveryAt` / `asc` or `desc` (default) |

```bash
curl -s "http://localhost:4000/api/shipments?overdue=true&sortBy=estimatedDeliveryAt&sortOrder=asc" \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "data": [
    {
      "id": "cm…",
      "shipmentNumber": "CF-2026-00029",
      "status": "BOOKED",
      "origin": "Jakarta (Tanjung Priok)",
      "destination": "Medan (Belawan)",
      "estimatedDeliveryAt": "2026-11-22T15:52:00.000Z",
      "actualDeliveryAt": null,
      "isOverdue": true,
      "deliveryPerformance": null,
      "customer": { "id": "cm…", "companyName": "PT Arunika Niaga Sejahtera" },
      "container": { "id": "cm…", "containerNumber": "TJPU1208669", "containerType": "REEFER_20" },
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 }
}
```

### Example workflow: create → book → depart → deliver

```bash
# 1. Pick a customer and an available container
curl -s "http://localhost:4000/api/customers?pageSize=1" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:4000/api/containers?available=true&pageSize=1" -H "Authorization: Bearer $TOKEN"

# 2. Create (starts as DRAFT; ETA must be in the future, ISO-8601 UTC)
curl -s -X POST http://localhost:4000/api/shipments -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"<id>","containerId":"<id>","origin":"Bitung","destination":"Sorong",
       "estimatedDeliveryAt":"2026-12-05T08:00:00.000Z","notes":"Fragile"}'

# 3. Advance one step at a time
curl -s -X PATCH http://localhost:4000/api/shipments/<id>/status -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"BOOKED","remarks":"Space confirmed"}'
#    … then IN_TRANSIT, then DELIVERED (sets actualDeliveryAt = now)

# 4. History
curl -s http://localhost:4000/api/shipments/<id>/events -H "Authorization: Bearer $TOKEN"
```

### Editing rules (`PATCH /shipments/:id`)

| Status             | ADMIN                          | OPERATIONS                                      |
| ------------------ | ------------------------------ | ----------------------------------------------- |
| DRAFT              | all fields                     | all except `customerId` → 403 `FORBIDDEN_FIELD` |
| BOOKED, IN_TRANSIT | `estimatedDeliveryAt`, `notes` | same                                            |
| DELIVERED          | none → 409 `SHIPMENT_LOCKED`   | same                                            |

Changing a field that is locked for the current status → 409 `FIELD_NOT_EDITABLE`. Send
`"notes": null` to clear notes. A changed ETA must be in the future.

## Errors

Every error has the same body:

```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed.",
  "details": [
    {
      "field": "estimatedDeliveryAt",
      "messages": ["estimatedDeliveryAt must be a valid ISO-8601 date-time"]
    }
  ],
  "path": "/api/shipments",
  "timestamp": "2026-11-25T09:00:00.000Z"
}
```

| Status | `code`                                   | When                                                                    |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`                       | DTO validation failed or unknown property sent (`details` lists fields) |
| 400    | `MALFORMED_REQUEST_BODY`                 | Body is not valid JSON                                                  |
| 400    | `INVALID_ROUTE`                          | Origin equals destination (ignoring case and spacing)                   |
| 400    | `INVALID_ETA`                            | ETA is not in the future                                                |
| 400    | `RELATED_RESOURCE_NOT_FOUND`             | Customer or container id doesn't exist                                  |
| 401    | `UNAUTHENTICATED`                        | Missing, invalid or expired token; wrong credentials                    |
| 403    | `FORBIDDEN`                              | Role not allowed for the endpoint                                       |
| 403    | `FORBIDDEN_FIELD`                        | Role not allowed to change a field (e.g. OPERATIONS → `customerId`)     |
| 404    | `NOT_FOUND`                              | Unknown id or route                                                     |
| 409    | `INVALID_STATUS_TRANSITION`              | Not the next status (details include `allowedTransitions`)              |
| 409    | `CONCURRENT_MODIFICATION`                | Someone else changed the shipment first; reload and retry               |
| 409    | `CONTAINER_UNAVAILABLE`                  | Container is on another undelivered shipment                            |
| 409    | `FIELD_NOT_EDITABLE` / `SHIPMENT_LOCKED` | Editing rules (above)                                                   |
| 409    | `DUPLICATE_RESOURCE`                     | Company name or container number already exists                         |
| 413    | `PAYLOAD_TOO_LARGE`                      | Body over 100 kB                                                        |
| 415    | `UNSUPPORTED_MEDIA_TYPE`                 | Body not UTF-8                                                          |
| 429    | `TOO_MANY_REQUESTS`                      | Login rate limit                                                        |
| 500    | `INTERNAL_ERROR`                         | Unexpected; details are logged, never returned                          |

## Dashboard definitions

| KPI                  | Definition                                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| `totalShipments`     | All shipments                                                                   |
| `activeShipments`    | `BOOKED + IN_TRANSIT` (drafts are not committed yet)                            |
| `overdueShipments`   | Not delivered and ETA < now                                                     |
| `onTimeDeliveryRate` | `round(onTimeDelivered / delivered × 100, 1)`; `null` when nothing is delivered |
| `attention`          | Not delivered and ETA < now + 48h, soonest first (max 10 listed, `total` = all) |
| `recentActivity`     | Last 8 status events                                                            |
