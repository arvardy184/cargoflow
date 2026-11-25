import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ContainerType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp, setupSwagger } from '../../src/app.setup';
import { Clock, FixedClock } from '../../src/common/clock';
import { loadEnv } from '../../src/config/env';
import { computeCheckDigit } from '../../src/containers/domain/container-number';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Fixed "now" for every suite: business rules (ETA, overdue, numbering) are deterministic. */
export const NOW = new Date('2030-01-15T08:00:00.000Z');
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
export const TEST_PASSWORD = 'Integration!Pass1';

export const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();

export interface TestApp {
  app: NestExpressApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  clock: FixedClock;
  close: () => Promise<void>;
}

export async function createTestApp(envOverrides: Record<string, string> = {}): Promise<TestApp> {
  const previous = Object.fromEntries(Object.keys(envOverrides).map((k) => [k, process.env[k]]));
  Object.assign(process.env, envOverrides);
  try {
    const clock = new FixedClock(NOW);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(clock)
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, loadEnv());
    setupSwagger(app);
    await app.init();
    const server = app.getHttpServer() as App;
    return {
      app,
      http: () => request(server),
      prisma: app.get(PrismaService),
      clock,
      close: () => app.close(),
    };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Deletes all rows in foreign-key order. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.shipmentEvent.deleteMany(),
    prisma.shipment.deleteMany(),
    prisma.container.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.sequenceCounter.deleteMany(),
  ]);
}

// Low cost factor keeps fixtures fast; login verification works with any cost.
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

export interface Actor {
  id: string;
  email: string;
  role: Role;
  token: string;
  auth: { Authorization: string };
}

export async function createActor(t: TestApp, role: Role, email?: string): Promise<Actor> {
  const user = await t.prisma.user.create({
    data: {
      fullName: role === Role.ADMIN ? 'Test Admin' : 'Test Operator',
      email: email ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      passwordHash,
      role,
    },
  });
  const res = await t
    .http()
    .post('/api/auth/login')
    .send({ email: user.email, password: TEST_PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = (res.body as { accessToken: string }).accessToken;
  return {
    id: user.id,
    email: user.email,
    role,
    token,
    auth: { Authorization: `Bearer ${token}` },
  };
}

let containerSerial = 100000;
export function nextContainerNumber(owner = 'TST'): string {
  const prefix = `${owner}U${String(containerSerial++).padStart(6, '0')}`;
  return `${prefix}${computeCheckDigit(prefix)}`;
}

export async function createCustomer(
  t: TestApp,
  companyName = `PT Uji ${Math.random().toString(36).slice(2, 8)}`,
) {
  return t.prisma.customer.create({
    data: {
      companyName,
      contactPerson: 'Contact Person',
      email: 'contact@uji.example',
      phone: '+62 21 555 0101',
    },
  });
}

export async function createContainer(
  t: TestApp,
  containerType: ContainerType = ContainerType.DRY_20,
) {
  return t.prisma.container.create({
    data: { containerNumber: nextContainerNumber(), containerType },
  });
}

export interface BaseFixture {
  admin: Actor;
  ops: Actor;
  customer: { id: string };
  containers: { id: string; containerNumber: string }[];
}

export async function seedBase(t: TestApp, containerCount = 4): Promise<BaseFixture> {
  await resetDatabase(t.prisma);
  const [admin, ops, customer] = await Promise.all([
    createActor(t, Role.ADMIN),
    createActor(t, Role.OPERATIONS),
    createCustomer(t),
  ]);
  const containers = [];
  for (let i = 0; i < containerCount; i++) containers.push(await createContainer(t));
  return { admin, ops, customer, containers };
}

export function shipmentPayload(f: BaseFixture, overrides: Record<string, unknown> = {}) {
  return {
    customerId: f.customer.id,
    containerId: f.containers[0].id,
    origin: 'Jakarta (Tanjung Priok)',
    destination: 'Surabaya (Tanjung Perak)',
    estimatedDeliveryAt: hoursFromNow(72),
    ...overrides,
  };
}

export interface ShipmentBody {
  id: string;
  shipmentNumber: string;
  status: string;
  [key: string]: unknown;
}

export async function createShipment(
  t: TestApp,
  actor: Actor,
  payload: Record<string, unknown>,
): Promise<ShipmentBody> {
  const res = await t.http().post('/api/shipments').set(actor.auth).send(payload);
  if (res.status !== 201)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as ShipmentBody;
}

export async function advance(t: TestApp, actor: Actor, id: string, ...statuses: string[]) {
  for (const status of statuses) {
    const res = await t
      .http()
      .patch(`/api/shipments/${id}/status`)
      .set(actor.auth)
      .send({ status });
    if (res.status !== 200)
      throw new Error(`transition ${status} failed: ${JSON.stringify(res.body)}`);
  }
}
