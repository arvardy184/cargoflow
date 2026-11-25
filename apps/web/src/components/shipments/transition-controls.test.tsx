import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiErrorBody, mockApi, renderWithClient, shipmentDetail } from '@/test/utils';
import { TransitionControls } from './transition-controls';

describe('TransitionControls', () => {
  it('offers exactly the transitions the API allows', () => {
    mockApi({});
    renderWithClient(
      <TransitionControls
        shipment={shipmentDetail({ status: 'BOOKED', allowedTransitions: ['IN_TRANSIT'] })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark as departed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as delivered' })).not.toBeInTheDocument();
  });

  it('explains that delivered shipments are final', () => {
    mockApi({});
    renderWithClient(
      <TransitionControls
        shipment={shipmentDetail({ status: 'DELIVERED', allowedTransitions: [] })}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Delivered shipments are final/)).toBeInTheDocument();
  });

  it('asks for confirmation and sends the transition with remarks', async () => {
    const { calls } = mockApi({
      'PATCH /shipments/shp_1/status': {
        status: 200,
        body: shipmentDetail({ status: 'IN_TRANSIT', allowedTransitions: ['DELIVERED'] }),
      },
      'GET /shipments': { status: 200, body: { data: [], meta: {} } },
    });
    renderWithClient(
      <TransitionControls
        shipment={shipmentDetail({ status: 'BOOKED', allowedTransitions: ['IN_TRANSIT'] })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mark as departed' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('CF-2026-00001 moves from Booked to In transit.');
    await userEvent.type(screen.getByLabelText(/Remarks/), 'Vessel sailed');
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as departed' }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      status: 'IN_TRANSIT',
      remarks: 'Vessel sailed',
    });
  });

  it('shows a conflict from a concurrent change inside the dialog', async () => {
    mockApi({
      'PATCH /shipments/shp_1/status': {
        status: 409,
        body: apiErrorBody(
          409,
          'CONCURRENT_MODIFICATION',
          'This shipment was modified by another user. Reload it and try again.',
        ),
      },
    });
    renderWithClient(
      <TransitionControls
        shipment={shipmentDetail({ status: 'BOOKED', allowedTransitions: ['IN_TRANSIT'] })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark as departed' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getAllByRole('button', { name: 'Mark as departed' }).at(-1)!);

    expect(await screen.findByRole('alert')).toHaveTextContent('modified by another user');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
