'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { LlmModelPicker } from '@/components/intelligence/llm-model-picker';
import { api } from '@/lib/api';
import { formatDate, money, roleLabel } from '@/lib/format';
import type { MemberRow } from '@/lib/types';
import type { MembershipRole } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  assetCount: number;
  roles: MembershipRole[];
  walletBalances: Array<{
    currency: string;
    balance: number;
    updatedAt: string;
  }>;
  walletTransactions: Array<{
    id: string;
    amount: number;
    currency: string;
    description: string;
    createdAt: string;
  }>;
}

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [invite, setInvite] = useState({
    fullName: '',
    email: '',
    password: 'CaprovDemo!23',
    title: '',
    role: 'ANALYST' as MembershipRole,
  });
  const orgQuery = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const data = (await api.get<OrgSummary>('/organizations/current')).data;
      setName(data.name);
      return data;
    },
  });
  const membersQuery = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<MemberRow[]>('/users')).data,
  });
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () =>
      (await api.get<Array<{ key: MembershipRole; name: string; description: string }>>('/rbac/roles')).data,
  });
  const rename = useMutation({
    mutationFn: async () => api.patch('/organizations/current', { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
  const inviteMember = useMutation({
    mutationFn: async () => api.post('/users', invite),
    onSuccess: async () => {
      setInvite({ fullName: '', email: '', password: 'CaprovDemo!23', title: '', role: 'ANALYST' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const org = orgQuery.data;
  const walletBalances = org?.walletBalances ?? [];
  const walletTransactions = org?.walletTransactions ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Organization"
        title={org?.name ?? 'Workspace'}
        description={`${org?.memberCount ?? 0} members · ${org?.assetCount ?? 0} assets · ${org?.slug ?? ''}`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Firm settings</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate();
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" disabled={rename.isPending}>
              Save
            </Button>
          </form>
          <div className="mt-6 grid gap-2">
            {(rolesQuery.data ?? []).map((role) => (
              <div key={role.key} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <p className="font-medium">{role.name}</p>
                <p className="text-sm text-[var(--muted)]">{role.description}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Invite member</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              inviteMember.mutate();
            }}
          >
            <Field label="Full name">
              <Input value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} required />
            </Field>
            <Field label="Email">
              <Input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
            </Field>
            <Field label="Title">
              <Input value={invite.title} onChange={(e) => setInvite({ ...invite, title: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value as MembershipRole })}
              >
                <option value="ORG_ADMIN">Org admin</option>
                <option value="ANALYST">Analyst</option>
                <option value="COMPLIANCE">Compliance</option>
                <option value="VIEWER">Viewer</option>
              </Select>
            </Field>
            <Button type="submit" disabled={inviteMember.isPending}>
              Invite
            </Button>
          </form>
        </Card>
      </div>
      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Asset-owner wallet</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {walletBalances.length ? (
            walletBalances.map((wallet) => (
              <div key={wallet.currency} className="rounded-2xl border border-[var(--line)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{wallet.currency}</p>
                <p className="mt-2 font-display text-2xl font-semibold text-[var(--ink)]">
                  {money(wallet.balance, wallet.currency)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">Updated {formatDate(wallet.updatedAt)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--muted)]">No wallet credits have been posted yet.</p>
          )}
        </div>
        {walletTransactions.length ? (
          <div className="mt-6 space-y-3">
            {walletTransactions.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-[var(--line)] px-4 py-3">
                <p className="font-medium text-[var(--ink)]">{entry.description}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {money(entry.amount, entry.currency)} · {formatDate(entry.createdAt)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
      <Card className="p-6">
        <LlmModelPicker />
      </Card>
      <Card className="overflow-hidden">
        <div className="caprov-scroll">
        <table className="caprov-table w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-6">Member</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium sm:px-6">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(membersQuery.data ?? []).map((member) => (
              <tr key={member.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-4 sm:px-6">
                  <p className="font-medium">{member.fullName}</p>
                  <p className="break-anywhere text-xs text-[var(--muted)]">{member.email}</p>
                </td>
                <td className="px-3 py-4">
                  <Badge>{roleLabel[member.role]}</Badge>
                </td>
                <td className="px-4 py-4 text-[var(--muted)] sm:px-6">{formatDate(member.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
