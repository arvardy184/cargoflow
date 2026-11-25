'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form-controls';
import { isApiError } from '@/lib/api/client';
import { useLogin } from '@/lib/api/hooks';
import { loginSchema, type LoginValues } from '@/lib/schemas';

/** Only allow returning to an in-app path (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) {
    return '/dashboard';
  }
  return next;
}

function loginErrorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Sign-in failed. Try again.';
  if (error.status === 401) return 'The email or password is incorrect.';
  if (error.status === 429) return 'Too many sign-in attempts. Wait a minute, then try again.';
  return error.message;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => router.replace(safeNextPath(params.get('next'))) }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
      {params.get('reason') === 'expired' && !login.isError && (
        <Alert tone="info">Your session has ended. Sign in again to continue.</Alert>
      )}
      {login.isError && <Alert>{loginErrorMessage(login.error)}</Alert>}

      <Field id="email" label="Email" error={errors.email?.message}>
        {(aria) => (
          <Input type="email" autoComplete="username" autoFocus {...aria} {...register('email')} />
        )}
      </Field>
      <Field id="password" label="Password" error={errors.password?.message}>
        {(aria) => (
          <Input
            type="password"
            autoComplete="current-password"
            {...aria}
            {...register('password')}
          />
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={login.isPending || login.isSuccess}
        className="mt-1 w-full"
      >
        {login.isPending || login.isSuccess ? 'Signing in…' : 'Sign in'}
      </Button>

      {process.env.NODE_ENV !== 'production' && (
        <p className="rounded-panel border border-dashed border-line px-3 py-2 text-xs leading-relaxed text-muted">
          Development demo accounts: <span className="text-ink">admin@cargoflow.local</span> and{' '}
          <span className="text-ink">ops@cargoflow.local</span>, password from{' '}
          <code className="text-ink">SEED_DEMO_PASSWORD</code> in{' '}
          <code className="text-ink">apps/api/.env</code>.
        </p>
      )}
    </form>
  );
}
