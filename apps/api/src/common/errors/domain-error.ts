/**
 * Business-rule failures raised by services and domain functions. They carry a stable,
 * machine-readable `code`; the global exception filter maps each code to an HTTP status.
 */
export const DOMAIN_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  MALFORMED_REQUEST_BODY: 400,
  INVALID_ROUTE: 400,
  INVALID_ETA: 400,
  RELATED_RESOURCE_NOT_FOUND: 400,
  FORBIDDEN_FIELD: 403,
  NOT_FOUND: 404,
  INVALID_STATUS_TRANSITION: 409,
  SHIPMENT_LOCKED: 409,
  FIELD_NOT_EDITABLE: 409,
  CONTAINER_UNAVAILABLE: 409,
  CONCURRENT_MODIFICATION: 409,
  DUPLICATE_RESOURCE: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_ERROR_STATUS;

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get httpStatus(): number {
    return DOMAIN_ERROR_STATUS[this.code];
  }

  static notFound(entity: string, id: string): DomainError {
    return new DomainError('NOT_FOUND', `${entity} '${id}' was not found.`);
  }
}
