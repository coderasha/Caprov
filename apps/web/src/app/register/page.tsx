'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { RegistrationRequestReceipt } from '@caprov/types';
import Link from 'next/link';
import { useState } from 'react';

export default function RegisterPage() {
  const [form, setForm] = useState({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
    title: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationRequestReceipt | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post<RegistrationRequestReceipt>('/auth/register', form);
      setReceipt(response.data);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
          : undefined;
      setError(Array.isArray(message) ? message.join(', ') : message || 'Could not submit the access request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--paper)] px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--muted)]">
          Caprov
        </p>
        <h1 className="mt-3 text-center text-3xl font-semibold tracking-tight">Request organization access</h1>
        <Card className="mt-8 p-6">
          {receipt ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Request submitted</h2>
              <p className="text-sm leading-7 text-[var(--muted)]">{receipt.message}</p>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm">
                <p>
                  <span className="font-medium">Organization:</span> {receipt.organizationName}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Email:</span> {receipt.email}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Status:</span> {receipt.status}
                </p>
              </div>
              <Link href="/login" className="inline-block text-sm underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={onSubmit}>
              <Field label="Organization">
                <Input
                  value={form.organizationName}
                  onChange={(event) => setForm({ ...form, organizationName: event.target.value })}
                  required
                />
              </Field>
              <Field label="Your name">
                <Input
                  value={form.fullName}
                  onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  required
                />
              </Field>
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Managing partner"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={8}
                  required
                />
              </Field>
              {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? 'Submitting…' : 'Request approval'}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Already approved?{' '}
          <Link href="/login" className="text-[var(--text)] underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
