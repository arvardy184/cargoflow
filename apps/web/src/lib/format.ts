import type { AuditAction, ContainerType, ShipmentStatus } from './api/types';

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  DRAFT: 'Draft',
  BOOKED: 'Booked',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
};

/** Verb used on the button that moves a shipment into the given status. */
export const TRANSITION_ACTION: Record<ShipmentStatus, string> = {
  DRAFT: 'Return to draft',
  BOOKED: 'Confirm booking',
  IN_TRANSIT: 'Mark as departed',
  DELIVERED: 'Mark as delivered',
};

export const CONTAINER_TYPE_LABEL: Record<ContainerType, string> = {
  DRY_20: "20' dry",
  DRY_40: "40' dry",
  HIGH_CUBE_40: "40' high cube",
  REEFER_20: "20' reefer",
  REEFER_40: "40' reefer",
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  STATUS_CHANGE: 'Status changed',
};

/** Audit field labels, in the order they are displayed. Audit snapshots store raw ids. */
export const FIELD_LABEL: Record<string, string> = {
  shipmentNumber: 'Shipment number',
  status: 'Status',
  customerId: 'Customer ID',
  containerId: 'Container ID',
  origin: 'Origin',
  destination: 'Destination',
  estimatedDeliveryAt: 'ETA',
  actualDeliveryAt: 'Delivered at',
  notes: 'Notes',
  remarks: 'Remarks',
  companyName: 'Company',
  contactPerson: 'Contact person',
  email: 'Email',
  phone: 'Phone',
  containerNumber: 'Container number',
  containerType: 'Type',
};

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** API timestamps are UTC; they are always shown in the viewer's local time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
}

/** Human distance between a timestamp and now, e.g. "in 3 days", "5 hours ago". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(0, 'minute');
}

/** `<input type="datetime-local">` works in local time without a zone; convert both ways. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function formatAuditValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status' && typeof value === 'string' && value in STATUS_LABEL) {
    return STATUS_LABEL[value as ShipmentStatus];
  }
  if (field === 'containerType' && typeof value === 'string' && value in CONTAINER_TYPE_LABEL) {
    return CONTAINER_TYPE_LABEL[value as ContainerType];
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  return typeof value === 'string' ? value : JSON.stringify(value);
}
