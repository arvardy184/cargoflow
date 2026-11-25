# CargoFlow — Business Requirements Document

> CargoFlow is an original demonstration project built with synthetic data. It is not affiliated
> with any real logistics company or system.

## 1. Background

A logistics company moves containerized cargo between Indonesian ports and cities for business
customers. Bookings, status updates and ETAs are tracked in spreadsheets and chat groups.

## 2. Problem

- Shipment status isn't visible in one place; answering "where is this container?" means asking around.
- Late shipments are noticed when the customer complains, not before.
- Changes can't be traced: nobody can tell who changed an ETA or a status, or when.
- Reporting (how many delivered, how many on time) is assembled by hand and disagrees between people.
- Business rules (e.g. a shipment can't be delivered before it departs; a container can't be on
  two active jobs) depend on individual discipline.

## 3. Objectives

| #   | Objective                                          | Measure                                                                    |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| O1  | One source of truth for shipments and their status | All shipments and history in one system                                    |
| O2  | Surface delays early                               | Overdue and due-within-48h shipments shown on the dashboard                |
| O3  | Full traceability                                  | Every create, edit and status change recorded with actor and time          |
| O4  | Reliable KPIs                                      | Totals, active, delivered, overdue and on-time rate computed by the system |
| O5  | Consistent rules                                   | Lifecycle and editing rules enforced by the system, not by habit           |

## 4. Stakeholders

| Stakeholder                        | Interest                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| Operations staff                   | Create and advance shipments quickly; see what needs attention |
| Operations manager / administrator | Oversight, customer master data, audit trail                   |
| Customers (indirect)               | Accurate ETAs and proactive delay handling                     |
| IT                                 | Maintainable, secure, documented system                        |

## 5. User roles

| Role       | Can                                                                                                                                     | Cannot                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ADMIN      | Everything Operations can; add and edit customers; reassign a draft's customer; view the audit log                                      | —                                                                  |
| OPERATIONS | View dashboard, shipments, history, customers, containers; create shipments; edit permitted fields; advance status; register containers | Edit customers, reassign a shipment's customer, view the audit log |

## 6. Business requirements

| ID    | Requirement                                                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-1  | Users sign in with email and password; all data requires a signed-in user.                                                                      |
| BR-2  | Staff can register a shipment for an existing customer and container, with origin, destination, ETA and notes.                                  |
| BR-3  | Each shipment gets a unique, human-readable number (e.g. `CF-2026-00042`).                                                                      |
| BR-4  | Shipments follow the lifecycle Draft → Booked → In transit → Delivered, one step at a time. Delivered is final.                                 |
| BR-5  | Every status change is recorded in the shipment's history with who, when and optional remarks.                                                  |
| BR-6  | Every create, edit and status change is recorded in an audit trail with before/after values.                                                    |
| BR-7  | A shipment is overdue when its ETA has passed and it isn't delivered. Overdue is shown, not set manually.                                       |
| BR-8  | When delivered, the delivery time is recorded and compared with the ETA (on time / late).                                                       |
| BR-9  | The dashboard shows total, active, delivered and overdue shipments, the on-time delivery rate, shipments needing attention and recent activity. |
| BR-10 | Staff can search and filter shipments by number, status, customer and overdue, and sort by creation date or ETA.                                |
| BR-11 | Administrators maintain customer records; company names are unique.                                                                             |
| BR-12 | Containers are identified by valid ISO 6346 numbers; each number is registered once.                                                            |
| BR-13 | A container can be assigned to only one undelivered shipment at a time.                                                                         |
| BR-14 | Role restrictions are enforced by the system, not only hidden in the interface.                                                                 |

## 7. Business rules

1. New shipments start as **Draft**.
2. Allowed transitions: Draft → Booked, Booked → In transit, In transit → Delivered. Anything else is rejected with a clear reason.
3. **Delivered** shipments can't be edited or moved.
4. While **Draft**, every field can be edited; only an administrator may change the customer.
5. Once **Booked** or **In transit**, only the ETA and notes can be changed.
6. Origin and destination are required and must differ.
7. An ETA, when set or changed, must be in the future.
8. On-time delivery rate = on-time deliveries ÷ deliveries × 100, one decimal place. With no deliveries it is shown as "no data", not 0% or 100%.
9. A status change, its history entry and its audit entry are saved together or not at all.

## 8. Scope

**In scope:** authentication, role-based access, shipments (create, list, detail, edit, lifecycle),
status history, customers, containers, dashboard, audit log, responsive web UI, REST API with
OpenAPI documentation, automated tests.

**Out of scope:** customer self-service portal, invoicing and pricing (a quotation module is a
possible later phase), carrier/vessel integration and live tracking, document management, user
administration screens (accounts are provisioned by script), notifications, multi-language UI,
deleting records.

## 9. Acceptance criteria

| ID    | Criterion                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------- |
| AC-1  | An unauthenticated request to any data endpoint returns 401; the web app redirects to sign-in.            |
| AC-2  | An Operations user receives 403 for customer edits and the audit log.                                     |
| AC-3  | A new shipment is saved as Draft with a unique number, a history entry and an audit entry.                |
| AC-4  | Skipping, reversing or repeating a status is rejected and leaves no history or audit entry.               |
| AC-5  | Two simultaneous identical status changes result in exactly one change.                                   |
| AC-6  | A container already on an undelivered shipment can't be assigned again, even under simultaneous requests. |
| AC-7  | Overdue shipments are flagged in the list, the detail page and the dashboard.                             |
| AC-8  | Dashboard KPIs match the stored data and show "no data" for the on-time rate when nothing is delivered.   |
| AC-9  | Each audit entry shows the actor, record, action, time and changed values.                                |
| AC-10 | Forms show field-level errors from both client validation and the server.                                 |
