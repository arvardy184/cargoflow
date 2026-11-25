import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LifecycleRail, StatusBadge } from './status';

describe('StatusBadge', () => {
  it.each([
    ['DRAFT', 'Draft'],
    ['BOOKED', 'Booked'],
    ['IN_TRANSIT', 'In transit'],
    ['DELIVERED', 'Delivered'],
  ] as const)('labels %s as "%s" (never colour alone)', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('LifecycleRail', () => {
  const steps = () =>
    within(screen.getByRole('list', { name: 'Shipment lifecycle' })).getAllByRole('listitem');

  it('marks earlier stages completed and the current stage as the current step', () => {
    render(<LifecycleRail status="BOOKED" />);
    const [draft, booked, transit, delivered] = steps();
    expect(draft).toHaveTextContent('(completed)');
    expect(booked).toHaveAttribute('aria-current', 'step');
    expect(transit).toHaveTextContent('(upcoming)');
    expect(delivered).toHaveTextContent('(upcoming)');
  });

  it('shows every stage completed once delivered', () => {
    render(<LifecycleRail status="DELIVERED" />);
    expect(steps().every((s) => s.textContent?.includes('(completed)'))).toBe(true);
  });
});
