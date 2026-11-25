import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorBody, mockApi, renderWithClient, shipmentDetail } from '@/test/utils';
import { CreateShipmentForm } from './create-shipment-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const lookups = {
  'GET /customers': {
    status: 200,
    body: {
      data: [{ id: 'cus_1', companyName: 'PT Arunika Niaga Sejahtera' }],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
  },
  'GET /containers': {
    status: 200,
    body: {
      data: [
        {
          id: 'con_1',
          containerNumber: 'CSQU3054383',
          containerType: 'DRY_20',
          isAvailable: true,
          activeShipment: null,
        },
      ],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    },
  },
};

function futureLocal(): string {
  const d = new Date(Date.now() + 3 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fillValidForm() {
  await screen.findByRole('option', { name: 'PT Arunika Niaga Sejahtera' });
  await screen.findByRole('option', { name: /CSQU3054383/ });
  await userEvent.selectOptions(screen.getByLabelText('Customer'), 'cus_1');
  await userEvent.selectOptions(screen.getByLabelText('Container'), 'con_1');
  await userEvent.type(screen.getByLabelText('Origin'), 'Bitung');
  await userEvent.type(screen.getByLabelText('Destination'), 'Sorong');
  await userEvent.type(screen.getByLabelText('Estimated delivery (ETA)'), futureLocal());
}

describe('CreateShipmentForm', () => {
  beforeEach(() => push.mockReset());

  it('loads only available containers and shows validation errors without calling the API', async () => {
    const { calls } = mockApi(lookups);
    renderWithClient(<CreateShipmentForm />);
    await screen.findByRole('option', { name: /CSQU3054383/ });
    expect(calls.find((c) => c.path === '/containers')?.url.searchParams.get('available')).toBe(
      'true',
    );

    await userEvent.type(screen.getByLabelText('Origin'), 'Bitung');
    await userEvent.type(screen.getByLabelText('Destination'), 'bitung');
    await userEvent.click(screen.getByRole('button', { name: 'Create shipment' }));

    expect(await screen.findByText('Select a customer.')).toBeInTheDocument();
    expect(screen.getByText('Destination must be different from the origin.')).toBeInTheDocument();
    expect(screen.getByText('Choose an estimated delivery date and time.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('submits a UTC ETA and opens the new shipment', async () => {
    const { calls } = mockApi({
      ...lookups,
      'POST /shipments': { status: 201, body: shipmentDetail({ id: 'new_1' }) },
    });
    renderWithClient(<CreateShipmentForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Create shipment' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/shipments/new_1?created=1'));
    const body = calls.find((c) => c.method === 'POST')?.body as Record<string, string>;
    expect(body).toMatchObject({
      customerId: 'cus_1',
      containerId: 'con_1',
      origin: 'Bitung',
      destination: 'Sorong',
    });
    expect(body.estimatedDeliveryAt).toMatch(/Z$/);
    expect(body).not.toHaveProperty('notes');
  });

  it('shows a business-rule error from the API on the form and the field', async () => {
    mockApi({
      ...lookups,
      'POST /shipments': {
        status: 409,
        body: apiErrorBody(
          409,
          'CONTAINER_UNAVAILABLE',
          'Container is already assigned to active shipment CF-2026-00007.',
          [
            {
              field: 'containerId',
              messages: ['container is assigned to another active shipment'],
            },
          ],
        ),
      },
    });
    renderWithClient(<CreateShipmentForm />);
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: 'Create shipment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Container is already assigned to active shipment CF-2026-00007.',
    );
    expect(
      screen.getByText('Container is assigned to another active shipment.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Container')).toHaveAttribute('aria-invalid', 'true');
    expect(push).not.toHaveBeenCalled();
  });
});
