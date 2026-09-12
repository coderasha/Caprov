'use client';

import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { AuthSession } from '@caprov/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: string;
}

const DEMO_PERSONAS: DemoAccount[] = [
  { name: 'Priya Nair', email: 'priya@caprov.io', password: 'CaprovDemo!23', role: 'Platform admin' },
  { name: 'Elena Voss', email: 'elena@meridian.caprov', password: 'CaprovDemo!23', role: 'Organization admin' },
  { name: 'Arjun Mehta', email: 'arjun@meridian.caprov', password: 'CaprovDemo!23', role: 'Analyst' },
  { name: 'Sofia Laurent', email: 'sofia@meridian.caprov', password: 'CaprovDemo!23', role: 'Compliance' },
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState('arjun@meridian.caprov');
  const [password, setPassword] = useState('CaprovDemo!23');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Keep personas visible even while the API is starting or unavailable.
  const [demos, setDemos] = useState<DemoAccount[]>(DEMO_PERSONAS);

  useEffect(() => {
    api
      .get<DemoAccount[]>('/auth/demo-accounts')
      .then((response) => setDemos(response.data))
      .catch(() => undefined);
  }, []);

  async function signIn(loginEmail = email, loginPassword = password) {
    setLoading(true);
    setError('');
    try {
      const response = await api.post<AuthSession>('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      setSession(response.data);
      router.push('/dashboard');
    } catch {
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void signIn();
  }

  return (
    <main className="platform-canvas grid min-h-screen place-items-center px-4 py-8">
      <div className="hub-auth-shell">
        <div className="text-center">
          <CaprovWordmark className="font-display text-3xl font-semibold text-[var(--ink)]" markClassName="text-[var(--gold)]" />
          <p className="mt-3 text-sm text-[var(--muted)]">Private-asset intelligence</p>
          <h1 className="mt-8 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Sign in
          </h1>
        </div>
        <Card className="mt-8 p-6">
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label="Email">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
            </Field>
            <Field label="Password">
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
              />
            </Field>
            {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
            <Button type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Continue'}
            </Button>
          </form>
          {demos.length > 0 ? (
            <div className="mt-6 border-t border-[var(--line)] pt-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Enter as a demo persona</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Choose a role to sign in with its access level.</p>
              <div className="mt-3 grid gap-2">
                {demos.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="min-h-12 rounded-2xl border border-[var(--line)] px-3 py-3 text-left text-sm transition hover:border-[var(--gold)] hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loading}
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      void signIn(account.email, account.password);
                    }}
                  >
                    <span className="font-medium">{account.name}</span>
                    <span className="ml-2 text-[var(--muted)]">{loading ? 'Signing in…' : account.role}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          New firm?{' '}
          <Link href="/register" className="text-[var(--text)] underline">
            Request organization access
          </Link>
        </p>
      </div>
    </main>
  );
}
