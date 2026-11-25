# CargoFlow — Entity Relationship Diagram

Generated from `apps/api/prisma/schema.prisma` (migration `20261125050748_init`). All timestamps
are `DATETIME(3)` in UTC. Ids are CUIDs (`VARCHAR(30)`).

```mermaid
erDiagram
  User ||--o{ Shipment : "creates (createdById)"
  User ||--o{ ShipmentEvent : "changes (changedById)"
  User ||--o{ AuditLog : "acts (actorId)"
  Customer ||--o{ Shipment : "owns (customerId)"
  Container ||--o{ Shipment : "carries (containerId)"
  Shipment ||--o{ ShipmentEvent : "has history (cascade)"

  User {
    varchar30 id PK
    varchar120 fullName
    varchar191 email UK
    varchar100 passwordHash "bcrypt"
    enum role "ADMIN | OPERATIONS"
    datetime3 createdAt
    datetime3 updatedAt
  }

  Customer {
    varchar30 id PK
    varchar150 companyName UK
    varchar120 contactPerson
    varchar191 email
    varchar30 phone
    datetime3 createdAt
    datetime3 updatedAt
  }

  Container {
    varchar30 id PK
    varchar11 containerNumber UK "ISO 6346"
    enum containerType "DRY_20 | DRY_40 | HIGH_CUBE_40 | REEFER_20 | REEFER_40"
    datetime3 createdAt
    datetime3 updatedAt
  }

  Shipment {
    varchar30 id PK
    varchar20 shipmentNumber UK "CF-YYYY-NNNNN"
    varchar30 customerId FK
    varchar30 containerId FK
    varchar100 origin
    varchar100 destination
    datetime3 estimatedDeliveryAt
    datetime3 actualDeliveryAt "nullable, set on DELIVERED"
    enum status "DRAFT | BOOKED | IN_TRANSIT | DELIVERED"
    varchar1000 notes "nullable"
    varchar30 createdById FK
    datetime3 createdAt
    datetime3 updatedAt
  }

  ShipmentEvent {
    varchar30 id PK
    varchar30 shipmentId FK
    enum previousStatus "nullable (creation)"
    enum newStatus
    varchar30 changedById FK
    varchar500 remarks "nullable"
    datetime3 createdAt
  }

  AuditLog {
    varchar30 id PK
    varchar30 actorId FK
    enum entityType "SHIPMENT | CUSTOMER | CONTAINER"
    varchar30 entityId "polymorphic, no FK"
    enum action "CREATE | UPDATE | STATUS_CHANGE"
    json beforeData "nullable"
    json afterData "nullable"
    datetime3 createdAt
  }

  SequenceCounter {
    varchar50 name PK "e.g. shipment-2026"
    int value
  }
```

## Relationships and delete behavior

| Relationship                                   | On delete                                    | Why                                                                     |
| ---------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Shipment → Customer, Container, User (creator) | `RESTRICT`                                   | History must not be orphaned. The API has no delete endpoints.          |
| ShipmentEvent → Shipment                       | `CASCADE`                                    | Events belong to the shipment. Only relevant for test-database resets.  |
| ShipmentEvent → User, AuditLog → User          | `RESTRICT`                                   | Actors of recorded history can't disappear.                             |
| AuditLog → entity                              | none (polymorphic `entityType` + `entityId`) | One audit table for all entity types. Labels are resolved at read time. |

## Constraints and indexes

| Table         | Unique            | Indexes                                                                                                                     |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| User          | `email`           |                                                                                                                             |
| Customer      | `companyName`     |                                                                                                                             |
| Container     | `containerNumber` |                                                                                                                             |
| Shipment      | `shipmentNumber`  | `(status, estimatedDeliveryAt)`, `(customerId, createdAt)`, `(containerId, status)`, `(createdAt)`, `(estimatedDeliveryAt)` |
| ShipmentEvent |                   | `(shipmentId, createdAt)`, `(createdAt)`                                                                                    |
| AuditLog      |                   | `(entityType, entityId, createdAt)`, `(actorId)`, `(createdAt)`                                                             |

Rules that a plain constraint can't express are enforced by the API inside transactions. For
example, "a container is on at most one undelivered shipment" is a conditional uniqueness rule
that MySQL can't declare. See [ARCHITECTURE.md](ARCHITECTURE.md#transaction-and-concurrency-strategy).

## Derived values (not stored)

| Value                 | Definition                                                                          |
| --------------------- | ----------------------------------------------------------------------------------- |
| Overdue               | `status ≠ DELIVERED AND estimatedDeliveryAt < now`                                  |
| Delivery performance  | `ON_TIME` if `actualDeliveryAt ≤ estimatedDeliveryAt`, else `LATE` (delivered only) |
| Active shipments      | `BOOKED + IN_TRANSIT`                                                               |
| On-time delivery rate | `round(onTimeDelivered / delivered × 100, 1)`, `null` when nothing is delivered     |
