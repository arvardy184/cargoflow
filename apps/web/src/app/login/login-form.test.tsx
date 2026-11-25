import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorBody, mockApi, renderWithClient } from '@/test/utils';
import { LoginForm, safeNextPath } from './login-form';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    replace.mockReset();
    search = '';
  });

  it('validates before calling the API', async () => {
    const { spy } = mockApi({});
    renderWithClient(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a clear message for wrong credentials', async () => {
    mockApi({
      'POST /auth/login': {
        status: 401,
        body: apiErrorBody(401, 'UNAUTHENTICATED', 'Invalid email or password.'),
      },
    });
    renderWithClient(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'ops@cargoflow.local');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is incorrect.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains rate limiting', async () => {
    mockApi({
      'POST /auth/login': {
        status: 429,
        body: apiErrorBody(429, 'TOO_MANY_REQUESTS', 'Too many requests.'),
      },
    });
    renderWithClient(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'ops@cargoflow.local');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many sign-in attempts/);
  });

  it('signs in and returns to the requested page', async () => {
    search = 'next=%2Fshipments%3Fstatus%3DBOOKED';
    const { calls } = mockApi({
      'POST /auth/login': {
        status: 200,
        body: {
          user: { id: 'u1', fullName: 'Ops', email: 'ops@cargoflow.local', role: 'OPERATIONS' },
          accessToken: 't',
          expiresAt: '',
        },
      },
    });
    renderWithClient(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), 'ops@cargoflow.local');
    await userEvent.type(screen.getByLabelText('Password'), 'CargoFlow!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/shipments?status=BOOKED'));
    expect(calls[0].body).toEqual({ email: 'ops@cargoflow.local', password: 'CargoFlow!2026' });
  });

  it('tells the user when their session expired', () => {
    search = 'reason=expired';
    mockApi({});
    renderWithClient(<LoginForm />);
    expect(screen.getByRole('status')).toHaveTextContent('Your session has ended.');
  });
});

describe('safeNextPath', () => {
  it.each([
    [null, '/dashboard'],
    ['/shipments/abc', '/shipments/abc'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/login?next=/x', '/dashboard'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
