import { describe, expect, it } from 'vitest';
import { visibleNav } from './app-shell';

describe('visibleNav', () => {
  it('shows the audit log to administrators only', () => {
    expect(visibleNav('ADMIN').map((i) => i.label)).toContain('Audit log');
    expect(visibleNav('OPERATIONS').map((i) => i.label)).not.toContain('Audit log');
    expect(visibleNav('OPERATIONS').map((i) => i.label)).toEqual([
      'Dashboard',
      'Shipments',
      'Customers',
      'Containers',
    ]);
  });
});
