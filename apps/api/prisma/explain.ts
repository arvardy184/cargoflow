/**
 * Prints MySQL EXPLAIN plans for the queries behind the dashboard and the shipment list, so
 * index choices can be checked against real plans (`pnpm --filter @cargoflow/api db:explain`).
 * The SQL mirrors what Prisma generates for the corresponding service calls.
 */
import { PrismaClient } from '@prisma/client';
import { loadDotEnvFile } from '../src/config/env';

loadDotEnvFile();
const prisma = new PrismaClient();

/**
 * Prisma returns EXPLAIN columns positionally (f0…f11) in MySQL's fixed order: id, select_type,
 * table, partitions, type, possible_keys, key, key_len, ref, rows, filtered, Extra.
 */
type RawPlanRow = Record<`f${number}`, unknown>;

interface PlanRow {
  selectType: string;
  table: string;
  type: string;
  key: string;
  rows: string;
  extra: string;
}

function toPlanRow(raw: RawPlanRow): PlanRow {
  // EXPLAIN cells are strings, numbers or bigints (row counts).
  const text = (value: unknown) =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '-';
  return {
    selectType: text(raw.f1),
    table: text(raw.f2),
    type: text(raw.f4),
    key: text(raw.f6),
    rows: text(raw.f9),
    extra: text(raw.f11),
  };
}

const now = new Date().toISOString().slice(0, 23).replace('T', ' ');

const QUERIES: [string, string][] = [
  [
    'Dashboard: overdue count (status <> DELIVERED AND ETA < now)',
    `SELECT COUNT(*) FROM Shipment WHERE status <> 'DELIVERED' AND estimatedDeliveryAt < '${now}'`,
  ],
  [
    'Dashboard: counts per status (GROUP BY)',
    `SELECT status, COUNT(*) FROM Shipment GROUP BY status`,
  ],
  [
    'Dashboard: on-time deliveries (column-to-column comparison)',
    `SELECT COUNT(*) FROM Shipment WHERE status = 'DELIVERED' AND actualDeliveryAt <= estimatedDeliveryAt`,
  ],
  [
    'Dashboard: needs attention (undelivered, ETA < now + 48h, ordered by ETA)',
    `SELECT id FROM Shipment WHERE status <> 'DELIVERED' AND estimatedDeliveryAt < DATE_ADD('${now}', INTERVAL 48 HOUR)
     ORDER BY estimatedDeliveryAt ASC, id ASC LIMIT 10`,
  ],
  [
    'List: filter by status, newest first, page 1',
    `SELECT id FROM Shipment WHERE status = 'BOOKED' ORDER BY createdAt DESC, id DESC LIMIT 20`,
  ],
  [
    'List: filter by customer, newest first',
    `SELECT id FROM Shipment WHERE customerId = (SELECT id FROM Customer LIMIT 1) ORDER BY createdAt DESC, id DESC LIMIT 20`,
  ],
  [
    'List: sort by ETA',
    `SELECT id FROM Shipment ORDER BY estimatedDeliveryAt ASC, id ASC LIMIT 20`,
  ],
  [
    'Container availability check (assignment rule)',
    `SELECT shipmentNumber FROM Shipment WHERE containerId = (SELECT id FROM Container LIMIT 1) AND status <> 'DELIVERED' LIMIT 1`,
  ],
];

async function main(): Promise<void> {
  const [{ total }] = await prisma.$queryRaw<
    { total: bigint }[]
  >`SELECT COUNT(*) AS total FROM Shipment`;
  console.log(
    `Shipment rows: ${total}. Note: on very small tables MySQL may prefer a full scan.\n`,
  );

  for (const [title, sql] of QUERIES) {
    const plan = (await prisma.$queryRawUnsafe<RawPlanRow[]>(`EXPLAIN ${sql}`)).map(toPlanRow);
    console.log(`■ ${title}`);
    for (const row of plan) {
      console.log(
        `  ${row.selectType.padEnd(8)} table=${row.table.padEnd(9)} type=${row.type.padEnd(6)} ` +
          `key=${row.key.padEnd(38)} rows=${row.rows.padEnd(4)} extra=${row.extra}`,
      );
    }
    console.log();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
