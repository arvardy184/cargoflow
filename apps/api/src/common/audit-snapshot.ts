import { Prisma } from '@prisma/client';

/** Converts a record into a JSON-safe audit snapshot (Dates become ISO-8601 UTC strings). */
export function toSnapshot<T extends object, K extends keyof T>(
  record: T,
  keys: readonly K[],
): Prisma.InputJsonObject {
  const snapshot: Record<string, Prisma.InputJsonValue | null> = {};
  for (const key of keys) {
    const value = record[key];
    snapshot[String(key)] =
      value instanceof Date ? value.toISOString() : value === undefined ? null : value;
  }
  return snapshot;
}
