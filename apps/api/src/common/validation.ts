import { ValidationError, ValidationPipe } from '@nestjs/common';
import { DomainError } from './errors/domain-error';

export interface FieldViolation {
  field: string;
  messages: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldViolation[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldViolation[] = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new DomainError(
        'VALIDATION_ERROR',
        'Request validation failed.',
        flattenValidationErrors(errors),
      ),
  });
}
