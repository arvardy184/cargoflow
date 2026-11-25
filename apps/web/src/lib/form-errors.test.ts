import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/client';
import { applyApiErrors } from './form-errors';

describe('applyApiErrors', () => {
  it('attaches validation violations to visible fields and needs no form-level message', () => {
    const setError = vi.fn();
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', [
      { field: 'origin', messages: ['origin must be longer than or equal to 2 characters'] },
    ]);
    expect(applyApiErrors(error, setError, ['origin', 'destination'])).toBeUndefined();
    expect(setError).toHaveBeenCalledWith('origin', {
      type: 'server',
      message: 'Origin must be longer than or equal to 2 characters.',
    });
  });

  it('keeps the domain message at form level as well as marking the field', () => {
    const setError = vi.fn();
    const error = new ApiError(
      409,
      'CONTAINER_UNAVAILABLE',
      'Container is already assigned to active shipment CF-2026-00003.',
      [{ field: 'containerId', messages: ['container is assigned to another active shipment'] }],
    );
    expect(applyApiErrors(error, setError, ['containerId'])).toBe(
      'Container is already assigned to active shipment CF-2026-00003.',
    );
    expect(setError).toHaveBeenCalledTimes(1);
  });

  it('shows violations for fields that are not on the form at form level', () => {
    const setError = vi.fn();
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', [
      { field: 'status', messages: ['property status should not exist'] },
    ]);
    expect(applyApiErrors(error, setError, ['origin'])).toBe('Request validation failed.');
    expect(setError).not.toHaveBeenCalled();
  });

  it('handles unexpected errors', () => {
    expect(applyApiErrors(new Error('boom'), vi.fn(), [])).toBe('Something went wrong. Try again.');
  });
});
