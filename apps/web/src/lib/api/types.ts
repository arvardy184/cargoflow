/** Response shapes of the CargoFlow API. Timestamps are ISO-8601 strings in UTC. */

export type Role = 'ADMIN' | 'OPERATIONS';
export type ShipmentStatus = 'DRAFT' | 'BOOKED' | 'IN_TRANSIT' | 'DELIVERED';
export type ContainerType = 'DRY_20' | 'DRY_40' | 'HIGH_CUBE_40' | 'REEFER_20' | 'REEFER_40';
export type DeliveryPerformance = 'ON_TIME' | 'LATE';
export type AuditEntityType = 'SHIPMENT' | 'CUSTOMER' | 'CONTAINER';
export type AuditAction = 'CREATE' | 'UPDATE' | 'STATUS_CHANGE';
export type EditableShipmentField =
  'customerId' | 'containerId' | 'origin' | 'destination' | 'estimatedDeliveryAt' | 'notes';

export const SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  'DRAFT',
  'BOOKED',
  'IN_TRANSIT',
  'DELIVERED',
];
export const CONTAINER_TYPES: readonly ContainerType[] = [
  'DRY_20',
  'DRY_40',
  'HIGH_CUBE_40',
  'REEFER_20',
  'REEFER_40',
];

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
  expiresAt: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ShipmentSummary {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  estimatedDeliveryAt: string;
  actualDeliveryAt: string | null;
  isOverdue: boolean;
  deliveryPerformance: DeliveryPerformance | null;
  customer: { id: string; companyName: string };
  container: { id: string; containerNumber: string; containerType: ContainerType };
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentDetail extends Omit<ShipmentSummary, 'customer'> {
  notes: string | null;
  customer: {
    id: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
  };
  createdBy: { id: string; fullName: string };
  allowedTransitions: ShipmentStatus[];
  editableFields: EditableShipmentField[];
}

export interface ShipmentEvent {
  id: string;
  previousStatus: ShipmentStatus | null;
  newStatus: ShipmentStatus;
  remarks: string | null;
  createdAt: string;
  changedBy: { id: string; fullName: string; role: Role };
}

export interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  shipmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Container {
  id: string;
  containerNumber: string;
  containerType: ContainerType;
  isAvailable: boolean;
  activeShipment: { id: string; shipmentNumber: string; status: ShipmentStatus } | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  generatedAt: string;
  kpis: {
    totalShipments: number;
    activeShipments: number;
    deliveredShipments: number;
    overdueShipments: number;
    onTimeDeliveredShipments: number;
    onTimeDeliveryRate: number | null;
    statusBreakdown: Record<ShipmentStatus, number>;
  };
  attention: {
    total: number;
    dueSoonWindowHours: number;
    shipments: (ShipmentSummary & { attentionReason: 'OVERDUE' | 'DUE_SOON' })[];
  };
  recentActivity: {
    id: string;
    previousStatus: ShipmentStatus | null;
    newStatus: ShipmentStatus;
    remarks: string | null;
    createdAt: string;
    shipment: { id: string; shipmentNumber: string };
    changedBy: { id: string; fullName: string };
  }[];
}

export interface AuditLogEntry {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string | null;
  action: AuditAction;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  actor: { id: string; fullName: string; role: Role };
  createdAt: string;
}

export interface FieldViolation {
  field: string;
  messages: string[];
}
