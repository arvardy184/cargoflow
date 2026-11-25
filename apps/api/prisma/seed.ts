/**
 * Development seed — SYNTHETIC data only. Every company, person and container is fictional.
 *
 * Repeatable: wipes CargoFlow tables and regenerates a deterministic dataset whose timestamps
 * are relative to "now", so the dashboard always shows overdue, due-soon and recent activity.
 * Every generated record is checked against the same domain rules the API enforces.
 */
import {
  AuditAction,
  AuditEntityType,
  ContainerType,
  Prisma,
  PrismaClient,
  Role,
  ShipmentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  computeCheckDigit,
  isValidContainerNumber,
} from '../src/containers/domain/container-number';
import { assertValidRoute, canTransition } from '../src/shipments/domain/shipment-lifecycle';
import { loadDotEnvFile } from '../src/config/env';

loadDotEnvFile();

const prisma = new PrismaClient();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Deterministic PRNG (mulberry32) so repeated seeds produce the same dataset shape.
function createRandom(seed: number) {
  let a = seed;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  };
}

const CUSTOMERS = [
  ['PT Arunika Niaga Sejahtera', 'Rina Wulandari', 'logistik@arunika-niaga.example'],
  ['PT Bahtera Sentosa Distribusi', 'Agus Setiawan', 'ops@bahtera-sentosa.example'],
  ['CV Cahaya Rempah Nusantara', 'Siti Rahmawati', 'ekspor@cahaya-rempah.example'],
  ['PT Delta Kopi Priangan', 'Yudi Hartono', 'supply@deltakopi.example'],
  ['PT Elang Baja Mandiri', 'Hendra Wijaya', 'shipping@elangbaja.example'],
  ['PT Fajar Tekstil Indah', 'Maya Kusuma', 'logistics@fajartekstil.example'],
  ['CV Garuda Elektronika Jaya', 'Teguh Prasetyo', 'gudang@garuda-elektronika.example'],
  ['PT Harapan Agro Lestari', 'Dewi Anggraini', 'distribusi@harapanagro.example'],
  ['PT Indah Kemasan Plastindo', 'Rudi Hermawan', 'ppic@indahkemasan.example'],
  ['PT Jepara Kriya Furnitur', 'Lestari Putri', 'export@jeparakriya.example'],
] as const;

const PORTS = [
  'Jakarta (Tanjung Priok)',
  'Surabaya (Tanjung Perak)',
  'Medan (Belawan)',
  'Makassar (Soekarno-Hatta)',
  'Semarang (Tanjung Emas)',
  'Balikpapan (Semayang)',
  'Pontianak (Dwikora)',
  'Banjarmasin (Trisakti)',
  'Batam (Batu Ampar)',
  'Bitung',
  'Sorong',
  'Padang (Teluk Bayur)',
] as const;

const CONTAINER_TYPES: ContainerType[] = [
  ContainerType.DRY_20,
  ContainerType.DRY_40,
  ContainerType.HIGH_CUBE_40,
  ContainerType.DRY_20,
  ContainerType.DRY_40,
  ContainerType.REEFER_20,
  ContainerType.REEFER_40,
];

const NOTES = [
  'Handle with care — fragile goods.',
  'Consignee requests delivery notification 24h in advance.',
  'Temperature-controlled cargo; keep reefer plugged in at yard.',
  'Customs documents pending final review.',
  null,
  null,
  null,
] as const;

type Plan =
  | { kind: 'DELIVERED_ON_TIME' }
  | { kind: 'DELIVERED_LATE' }
  | {
      kind: 'ACTIVE';
      status: Exclude<ShipmentStatus, 'DELIVERED'>;
      eta: 'OVERDUE' | 'DUE_SOON' | 'FUTURE';
    };

// 40 shipments: 22 delivered (16 on time, 6 late) and 18 active, 3 of which are overdue.
const PLANS: Plan[] = [
  ...Array.from({ length: 16 }, (): Plan => ({ kind: 'DELIVERED_ON_TIME' })),
  ...Array.from({ length: 6 }, (): Plan => ({ kind: 'DELIVERED_LATE' })),
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'OVERDUE' },
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'OVERDUE' },
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'DUE_SOON' },
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'DUE_SOON' },
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'FUTURE' },
  { kind: 'ACTIVE', status: 'IN_TRANSIT', eta: 'FUTURE' },
  { kind: 'ACTIVE', status: 'BOOKED', eta: 'OVERDUE' },
  { kind: 'ACTIVE', status: 'BOOKED', eta: 'DUE_SOON' },
  { kind: 'ACTIVE', status: 'BOOKED', eta: 'FUTURE' },
  { kind: 'ACTIVE', status: 'BOOKED', eta: 'FUTURE' },
  { kind: 'ACTIVE', status: 'BOOKED', eta: 'FUTURE' },
  ...Array.from({ length: 7 }, (): Plan => ({ kind: 'ACTIVE', status: 'DRAFT', eta: 'FUTURE' })),
];

const LIFECYCLE: ShipmentStatus[] = ['DRAFT', 'BOOKED', 'IN_TRANSIT', 'DELIVERED'];

function makeContainerNumber(owner: string, serial: number): string {
  const firstTen = `${owner}U${String(serial).padStart(6, '0')}`;
  return `${firstTen}${computeCheckDigit(firstTen)}`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed with NODE_ENV=production.');
  }
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 8) {
    throw new Error('Set SEED_DEMO_PASSWORD (min. 8 chars) in apps/api/.env before seeding.');
  }

  const rand = createRandom(20261125);
  const now = new Date();
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const setupAt = new Date(now.getTime() - 75 * DAY);

  await prisma.$transaction(
    async (tx) => {
      // Wipe in FK-safe order.
      await tx.auditLog.deleteMany();
      await tx.shipmentEvent.deleteMany();
      await tx.shipment.deleteMany();
      await tx.container.deleteMany();
      await tx.customer.deleteMany();
      await tx.user.deleteMany();
      await tx.sequenceCounter.deleteMany();

      const admin = await tx.user.create({
        data: {
          fullName: 'Alya Prameswari',
          email: 'admin@cargoflow.local',
          passwordHash,
          role: Role.ADMIN,
          createdAt: setupAt,
        },
      });
      const ops = await tx.user.create({
        data: {
          fullName: 'Bima Santoso',
          email: 'ops@cargoflow.local',
          passwordHash,
          role: Role.OPERATIONS,
          createdAt: setupAt,
        },
      });
      const actors = [admin, ops, ops];

      const audits: Prisma.AuditLogCreateManyInput[] = [];

      const customers = [];
      for (const [i, [companyName, contactPerson, email]] of CUSTOMERS.entries()) {
        const createdAt = new Date(setupAt.getTime() + i * HOUR);
        const customer = await tx.customer.create({
          data: {
            companyName,
            contactPerson,
            email,
            phone: `+62 21 5550 ${String(1100 + i * 37).padStart(4, '0')}`,
            createdAt,
          },
        });
        customers.push(customer);
        audits.push({
          actorId: admin.id,
          entityType: AuditEntityType.CUSTOMER,
          entityId: customer.id,
          action: AuditAction.CREATE,
          afterData: { companyName, contactPerson, email, phone: customer.phone },
          createdAt,
        });
      }

      const containers = [];
      const owners = ['CFL', 'NSA', 'TJP'];
      for (let i = 0; i < 24; i++) {
        const containerNumber = makeContainerNumber(owners[i % owners.length], 100231 + i * 4127);
        if (!isValidContainerNumber(containerNumber)) {
          throw new Error(`Generated invalid container number ${containerNumber}`);
        }
        const createdAt = new Date(setupAt.getTime() + DAY + i * HOUR);
        const containerType = CONTAINER_TYPES[i % CONTAINER_TYPES.length];
        const container = await tx.container.create({
          data: { containerNumber, containerType, createdAt },
        });
        containers.push(container);
        audits.push({
          actorId: ops.id,
          entityType: AuditEntityType.CONTAINER,
          entityId: container.id,
          action: AuditAction.CREATE,
          afterData: { containerNumber, containerType },
          createdAt,
        });
      }

      // Order plans by creation time: delivered (older) first, then active (recent).
      const sequenceByYear = new Map<number, number>();
      let activeContainerIndex = 0;

      for (const [index, plan] of PLANS.entries()) {
        const actor = actors[index % actors.length];
        const customer = rand.pick(customers);
        const origin = rand.pick(PORTS);
        let destination = rand.pick(PORTS);
        while (destination === origin) destination = rand.pick(PORTS);
        assertValidRoute(origin, destination);

        const transitDays = rand.int(5, 12);
        let createdAt: Date;
        let eta: Date;
        let actualDeliveryAt: Date | null = null;
        let finalStatus: ShipmentStatus;
        let containerId: string;

        if (plan.kind !== 'ACTIVE') {
          // Delivered history spread over the last ~60 days.
          createdAt = new Date(now.getTime() - (62 - index * 2) * DAY - rand.int(0, 10) * HOUR);
          eta = new Date(createdAt.getTime() + transitDays * DAY);
          actualDeliveryAt =
            plan.kind === 'DELIVERED_ON_TIME'
              ? new Date(eta.getTime() - rand.int(2, 30) * HOUR)
              : new Date(eta.getTime() + rand.int(8, 72) * HOUR);
          finalStatus = ShipmentStatus.DELIVERED;
          // Delivered shipments free their container, so history can reuse any container.
          containerId = containers[index % containers.length].id;
        } else {
          eta =
            plan.eta === 'OVERDUE'
              ? new Date(now.getTime() - rand.int(20, 72) * HOUR)
              : plan.eta === 'DUE_SOON'
                ? new Date(now.getTime() + rand.int(6, 40) * HOUR)
                : new Date(now.getTime() + rand.int(4, 14) * DAY);
          const leadDays = plan.status === 'DRAFT' ? rand.int(1, 3) : rand.int(4, 9);
          createdAt = new Date(
            Math.min(eta.getTime() - transitDays * DAY, now.getTime() - leadDays * DAY),
          );
          finalStatus = plan.status;
          // Each undelivered shipment needs its own container (domain rule).
          containerId = containers[activeContainerIndex++].id;
        }

        const year = createdAt.getUTCFullYear();
        const seq = (sequenceByYear.get(year) ?? 0) + 1;
        sequenceByYear.set(year, seq);
        const shipmentNumber = `CF-${year}-${String(seq).padStart(5, '0')}`;

        // Status timeline: walk the lifecycle up to the final status, validating each step.
        const path = LIFECYCLE.slice(0, LIFECYCLE.indexOf(finalStatus) + 1);
        const stepTimes = path.map((status, i) => {
          if (status === 'DELIVERED') return actualDeliveryAt as Date;
          const offset = [0, rand.int(4, 20) * HOUR, rand.int(26, 60) * HOUR][i];
          return new Date(createdAt.getTime() + offset);
        });
        const lastStepAt = stepTimes[stepTimes.length - 1];
        if (lastStepAt.getTime() > now.getTime()) {
          throw new Error(`Seed bug: ${shipmentNumber} has an event in the future`);
        }

        const notes = rand.pick(NOTES);
        const shipment = await tx.shipment.create({
          data: {
            shipmentNumber,
            customerId: customer.id,
            containerId,
            origin,
            destination,
            estimatedDeliveryAt: eta,
            actualDeliveryAt,
            status: finalStatus,
            notes,
            createdById: actor.id,
            createdAt,
            updatedAt: lastStepAt,
          },
        });

        audits.push({
          actorId: actor.id,
          entityType: AuditEntityType.SHIPMENT,
          entityId: shipment.id,
          action: AuditAction.CREATE,
          afterData: {
            shipmentNumber,
            customerId: customer.id,
            containerId,
            origin,
            destination,
            estimatedDeliveryAt: eta.toISOString(),
            status: 'DRAFT',
            notes,
          },
          createdAt,
        });

        const events: Prisma.ShipmentEventCreateManyInput[] = [
          {
            shipmentId: shipment.id,
            previousStatus: null,
            newStatus: 'DRAFT',
            changedById: actor.id,
            remarks: 'Shipment created',
            createdAt,
          },
        ];
        for (let i = 1; i < path.length; i++) {
          const [from, to] = [path[i - 1], path[i]];
          if (!canTransition(from, to)) throw new Error(`Seed bug: illegal ${from} → ${to}`);
          const stepActor = actors[(index + i) % actors.length];
          const remarks =
            to === 'BOOKED'
              ? 'Space confirmed with carrier'
              : to === 'IN_TRANSIT'
                ? `Departed ${origin}`
                : `Received by consignee at ${destination}`;
          events.push({
            shipmentId: shipment.id,
            previousStatus: from,
            newStatus: to,
            changedById: stepActor.id,
            remarks,
            createdAt: stepTimes[i],
          });
          audits.push({
            actorId: stepActor.id,
            entityType: AuditEntityType.SHIPMENT,
            entityId: shipment.id,
            action: AuditAction.STATUS_CHANGE,
            beforeData: { status: from },
            afterData: {
              status: to,
              remarks,
              ...(to === 'DELIVERED' ? { actualDeliveryAt: stepTimes[i].toISOString() } : {}),
            },
            createdAt: stepTimes[i],
          });
        }
        await tx.shipmentEvent.createMany({ data: events });
      }

      for (const [year, value] of sequenceByYear) {
        await tx.sequenceCounter.create({ data: { name: `shipment-${year}`, value } });
      }
      // Make sure the current year's counter exists so new shipments never race on its insert.
      const currentYear = now.getUTCFullYear();
      if (!sequenceByYear.has(currentYear)) {
        await tx.sequenceCounter.create({ data: { name: `shipment-${currentYear}`, value: 0 } });
      }

      await tx.auditLog.createMany({ data: audits });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.container.count(),
    prisma.shipment.count(),
    prisma.shipmentEvent.count(),
    prisma.auditLog.count(),
  ]);
  console.log(
    `Seed complete: ${counts[0]} users, ${counts[1]} customers, ${counts[2]} containers, ` +
      `${counts[3]} shipments, ${counts[4]} events, ${counts[5]} audit records.`,
  );
  console.log('Demo accounts (development only): admin@cargoflow.local, ops@cargoflow.local');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
