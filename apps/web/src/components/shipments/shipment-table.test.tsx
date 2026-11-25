import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { shipmentSummary } from '@/test/utils';
import { ShipmentTable } from './shipment-table';

describe('ShipmentTable', () => {
  const rows = [
    shipmentSummary({
      id: 'a',
      shipmentNumber: 'CF-2026-00001',
      status: 'IN_TRANSIT',
      isOverdue: true,
    }),
    shipmentSummary({
      id: 'b',
      shipmentNumber: 'CF-2026-00002',
      status: 'DELIVERED',
      actualDeliveryAt: '2026-11-30T09:00:00.000Z',
      deliveryPerformance: 'LATE',
      customer: { id: 'c2', companyName: 'CV Cahaya Rempah Nusantara' },
    }),
  ];

  it('renders one row per shipment with number, customer, route, container and status', () => {
    render(<ShipmentTable shipments={rows} />);
    const [, first, second] = screen.getAllByRole('row');
    expect(within(first).getByRole('link', { name: 'CF-2026-00001' })).toHaveAttribute(
      'href',
      '/shipments/a',
    );
    expect(first).toHaveTextContent('Jakarta (Tanjung Priok)');
    expect(first).toHaveTextContent('Surabaya (Tanjung Perak)');
    expect(first).toHaveTextContent('CSQU3054383');
    expect(first).toHaveTextContent("20' dry");
    expect(first).toHaveTextContent('In transit');
    expect(second).toHaveTextContent('CV Cahaya Rempah Nusantara');
    expect(second).toHaveTextContent('Delivered');
  });

  it('flags only overdue shipments and shows delivery performance for delivered ones', () => {
    render(<ShipmentTable shipments={rows} />);
    const [, first, second] = screen.getAllByRole('row');
    expect(within(first).getByText('Overdue')).toBeInTheDocument();
    expect(within(second).queryByText('Overdue')).not.toBeInTheDocument();
    expect(within(second).getByText('Late')).toBeInTheDocument();
  });

  it('gives each view action an accessible name', () => {
    render(<ShipmentTable shipments={rows} />);
    expect(screen.getByRole('link', { name: 'View shipment CF-2026-00002' })).toHaveAttribute(
      'href',
      '/shipments/b',
    );
  });
});
