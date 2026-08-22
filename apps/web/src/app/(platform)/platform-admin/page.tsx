'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { formatDate, roleLabel } from '@/lib/format';
import type {
  MemberRow,
  OrganizationAccessRequestRow,
  PlatformOrganizationRow,
} from '@/lib/types';
import { useAuthStore } from '@/stores/auth-store';
import type { AuthSession } from '@caprov/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function statusTone(status: PlatformOrganizationRow['status']) {
  return status === 'ACTIVE' ? 'ok' : 'danger';
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organization = useAuthStore((state) => state.organization);
  const roles = useAuthStore((state) => state.roles);
  const setSession = useAuthStore((state) => state.setSession);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [createForm, setCreateForm] = useState({
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
    title: '',
  });
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
    title: '',
  });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [statusNote, setStatusNote] = useState('');

  const orgsQuery = useQuery({
    queryKey: ['platform-organizations'],
    queryFn: async () => (await api.get<PlatformOrganizationRow[]>('/organizations')).data,
    enabled: roles.includes('PLATFORM_ADMIN'),
  });
  const fallbackOrgId = orgsQuery.data?.[0]?.id ?? '';
  const effectiveSelectedOrgId = selectedOrgId || fallbackOrgId;
  const requestsQuery = useQuery({
    queryKey: ['org-access-requests'],
    queryFn: async () => (await api.get<OrganizationAccessRequestRow[]>('/organizations/requests')).data,
    enabled: roles.includes('PLATFORM_ADMIN'),
  });
  const membersQuery = useQuery({
    queryKey: ['platform-organization-members', effectiveSelectedOrgId],
    queryFn: async () =>
      (await api.get<MemberRow[]>(`/organizations/${effectiveSelectedOrgId}/members`)).data,
    enabled: roles.includes('PLATFORM_ADMIN') && Boolean(effectiveSelectedOrgId),
  });

  const switchOrg = useMutation({
    mutationFn: async (organizationId: string) =>
      (await api.post<AuthSession>('/auth/switch-organization', { organizationId })).data,
    onSuccess: async (session) => {
      queryClient.clear();
      setSession(session);
      router.push('/dashboard');
      router.refresh();
    },
  });
  const createOrg = useMutation({
    mutationFn: async () => api.post('/organizations', createForm),
    onSuccess: async () => {
      setCreateForm({ organizationName: '', fullName: '', email: '', password: '', title: '' });
      await queryClient.invalidateQueries({ queryKey: ['platform-organizations'] });
    },
  });
  const approveRequest = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) =>
      api.post(`/organizations/requests/${id}/approve`, note?.trim() ? { note: note.trim() } : {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-organizations'] });
      await queryClient.invalidateQueries({ queryKey: ['org-access-requests'] });
    },
  });
  const rejectRequest = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) =>
      api.post(`/organizations/requests/${id}/reject`, note?.trim() ? { note: note.trim() } : {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org-access-requests'] });
    },
  });
  const updateOrgStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch(`/organizations/${id}/status`, statusNote.trim() ? { status, note: statusNote.trim() } : { status }),
    onSuccess: async () => {
      setStatusNote('');
      await queryClient.invalidateQueries({ queryKey: ['platform-organizations'] });
    },
  });
  const assignOrgAdmin = useMutation({
    mutationFn: async () => api.post(`/organizations/${effectiveSelectedOrgId}/org-admins`, adminForm),
    onSuccess: async () => {
      setAdminForm({ fullName: '', email: '', password: '', title: '' });
      await queryClient.invalidateQueries({ queryKey: ['platform-organizations'] });
      await queryClient.invalidateQueries({
        queryKey: ['platform-organization-members', effectiveSelectedOrgId],
      });
    },
  });

  if (!roles.includes('PLATFORM_ADMIN')) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Platform admin access required
          </h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            This view is reserved for the Caprov platform administrator role.
          </p>
        </Card>
      </div>
    );
  }

  const organizations = orgsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const pendingRequests = requests.filter((item) => item.status === 'PENDING');
  const selectedOrganization =
    organizations.find((item) => item.id === effectiveSelectedOrgId) ?? null;
  const selectedMembers = membersQuery.data ?? [];
  const selectedOrgAdmins = selectedMembers.filter((item) => item.role === 'ORG_ADMIN');

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Platform Admin"
        title="Tenant governance"
        description="Manage onboarding, tenant status, org-admin recovery, and workspace access without turning platform admin into a day-to-day operator."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Organizations', value: String(organizations.length), hint: 'Approved tenants' },
          { label: 'Pending requests', value: String(pendingRequests.length), hint: 'Awaiting platform approval' },
          {
            label: 'Suspended orgs',
            value: String(organizations.filter((item) => item.status === 'SUSPENDED').length),
            hint: 'Temporarily blocked tenants',
          },
          {
            label: 'Org admins',
            value: String(organizations.reduce((sum, item) => sum + item.orgAdminCount, 0)),
            hint: 'Recoverable tenant owners',
          },
        ].map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{stat.label}</p>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.03em] text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">{stat.hint}</p>
          </Card>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-6">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Create organization</h2>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              createOrg.mutate();
            }}
          >
            <Field label="Organization">
              <Input
                value={createForm.organizationName}
                onChange={(event) => setCreateForm({ ...createForm, organizationName: event.target.value })}
                required
              />
            </Field>
            <Field label="Org admin name">
              <Input
                value={createForm.fullName}
                onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })}
                required
              />
            </Field>
            <Field label="Org admin email">
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                required
              />
            </Field>
            <Field label="Temporary password">
              <Input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                required
                minLength={8}
              />
            </Field>
            <Field label="Title">
              <Input
                value={createForm.title}
                onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
                placeholder="Organization administrator"
              />
            </Field>
            <Button type="submit" disabled={createOrg.isPending}>
              {createOrg.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </form>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)]/80 px-6 py-5">
            <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Pending org-admin access requests</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Requests stay blocked until a platform admin approves them.
            </p>
          </div>
          {pendingRequests.length ? (
            <div className="grid gap-4 p-6">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[var(--ink)]">{request.organizationName}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {request.requesterName} · {request.requesterEmail}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Submitted {formatDate(request.createdAt)}
                        {request.requesterTitle ? ` · ${request.requesterTitle}` : ''}
                      </p>
                    </div>
                    <Badge tone="warn">{request.status}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <Field label="Review note">
                      <Textarea
                        rows={3}
                        value={reviewNotes[request.id] ?? ''}
                        onChange={(event) =>
                          setReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))
                        }
                        placeholder="Optional internal note or rejection reason"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={approveRequest.isPending}
                        onClick={() => approveRequest.mutate({ id: request.id, note: reviewNotes[request.id] })}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={rejectRequest.isPending}
                        onClick={() => rejectRequest.mutate({ id: request.id, note: reviewNotes[request.id] })}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-sm text-[var(--muted)]">No pending access requests.</div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)]/80 px-6 py-5">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Organizations</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Select a tenant for governance actions or switch into a workspace for support.
              </p>
            </div>
            <Badge>{organization?.name ?? 'No active workspace'}</Badge>
          </div>
          <div className="caprov-scroll">
            <table className="caprov-table w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                <tr>
                  <th className="px-6 py-3.5 font-medium">Organization</th>
                  <th className="px-3 py-3.5 font-medium">Status</th>
                  <th className="px-3 py-3.5 font-medium">Org admins</th>
                  <th className="px-3 py-3.5 font-medium">Members</th>
                  <th className="px-3 py-3.5 font-medium">Assets</th>
                  <th className="px-3 py-3.5 font-medium">Updated</th>
                  <th className="px-6 py-3.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((item) => {
                  const active = organization?.id === item.id;
                  const selected = effectiveSelectedOrgId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className="cursor-pointer border-t border-[var(--line)]/80"
                      onClick={() => setSelectedOrgId(item.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-[var(--ink)]">{item.name}</p>
                            <p className="mt-0.5 text-xs text-[var(--muted)]">{item.slug}</p>
                          </div>
                          {active ? <Badge tone="ok">Active workspace</Badge> : null}
                          {selected ? <Badge tone="ink">Selected</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                      </td>
                      <td className="px-3 py-4 text-[var(--muted)]">{item.orgAdminCount}</td>
                      <td className="px-3 py-4 text-[var(--muted)]">{item.memberCount}</td>
                      <td className="px-3 py-4 text-[var(--muted)]">{item.assetCount}</td>
                      <td className="px-3 py-4 text-[var(--muted)]">{formatDate(item.updatedAt)}</td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant={active ? 'secondary' : 'primary'}
                          disabled={switchOrg.isPending && switchOrg.variables === item.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            switchOrg.mutate(item.id);
                          }}
                        >
                          {active ? 'Current workspace' : 'Open workspace'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Governance controls</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Suspend tenants, reactivate them, or repair org-admin access.
              </p>
            </div>
            {selectedOrganization ? (
              <Badge tone={statusTone(selectedOrganization.status)}>{selectedOrganization.status}</Badge>
            ) : null}
          </div>

          {selectedOrganization ? (
            <div className="mt-5 space-y-5">
              <div className="rounded-2xl border border-[var(--line)] p-4">
                <p className="font-medium text-[var(--ink)]">{selectedOrganization.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{selectedOrganization.slug}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span>{selectedOrganization.memberCount} members</span>
                  <span>{selectedOrganization.orgAdminCount} org admins</span>
                  <span>{selectedOrganization.documentCount} documents</span>
                  <span>{selectedOrganization.portfolioCount} portfolios</span>
                </div>
                {selectedOrganization.suspensionNote ? (
                  <p className="mt-3 text-sm text-[var(--danger)]">
                    Suspended {formatDate(selectedOrganization.suspendedAt)} · {selectedOrganization.suspensionNote}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3">
                <Field label="Status note">
                  <Textarea
                    rows={3}
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                    placeholder="Reason for suspension or context for reactivation"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    disabled={selectedOrganization.status === 'SUSPENDED' || updateOrgStatus.isPending}
                    onClick={() => updateOrgStatus.mutate({ id: selectedOrganization.id, status: 'SUSPENDED' })}
                  >
                    Suspend organization
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={selectedOrganization.status === 'ACTIVE' || updateOrgStatus.isPending}
                    onClick={() => updateOrgStatus.mutate({ id: selectedOrganization.id, status: 'ACTIVE' })}
                  >
                    Reactivate organization
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--line)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--ink)]">Org-admin recovery</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Create a new org admin or reset an existing one into admin access.
                    </p>
                  </div>
                </div>
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    assignOrgAdmin.mutate();
                  }}
                >
                  <Field label="Full name">
                    <Input
                      value={adminForm.fullName}
                      onChange={(event) => setAdminForm({ ...adminForm, fullName: event.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={adminForm.email}
                      onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })}
                      required
                    />
                  </Field>
                  <Field label="Temporary password">
                    <Input
                      type="password"
                      value={adminForm.password}
                      onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })}
                      required
                      minLength={8}
                    />
                  </Field>
                  <Field label="Title">
                    <Input
                      value={adminForm.title}
                      onChange={(event) => setAdminForm({ ...adminForm, title: event.target.value })}
                      placeholder="Organization administrator"
                    />
                  </Field>
                  <Button type="submit" disabled={assignOrgAdmin.isPending}>
                    {assignOrgAdmin.isPending ? 'Saving…' : 'Create or reset org admin'}
                  </Button>
                </form>
              </div>

              <div className="rounded-2xl border border-[var(--line)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-[var(--ink)]">Current organization admins</p>
                  <Badge tone="muted">{selectedOrgAdmins.length}</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  {selectedOrgAdmins.length ? (
                    selectedOrgAdmins.map((member) => (
                      <div key={member.id} className="rounded-xl bg-[var(--paper)] px-3 py-2 text-sm">
                        <p className="font-medium text-[var(--ink)]">{member.fullName}</p>
                        <p className="text-[var(--muted)]">
                          {member.email} · {member.title ?? roleLabel[member.role]}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--muted)]">No org admins are assigned yet.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-[var(--muted)]">Select an organization to manage it.</div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)]/80 px-6 py-5">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em]">Recent request history</h2>
        </div>
        <div className="caprov-scroll">
          <table className="caprov-table w-full text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <tr>
                <th className="px-6 py-3.5 font-medium">Organization</th>
                <th className="px-3 py-3.5 font-medium">Requester</th>
                <th className="px-3 py-3.5 font-medium">Status</th>
                <th className="px-3 py-3.5 font-medium">Submitted</th>
                <th className="px-6 py-3.5 font-medium">Review note</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-t border-[var(--line)]/80">
                  <td className="px-6 py-4">
                    <p className="font-medium text-[var(--ink)]">{request.organizationName}</p>
                  </td>
                  <td className="px-3 py-4 text-[var(--muted)]">
                    {request.requesterName}
                    <p className="mt-0.5 text-xs">{request.requesterEmail}</p>
                  </td>
                  <td className="px-3 py-4">
                    <Badge tone={request.status === 'APPROVED' ? 'ok' : request.status === 'REJECTED' ? 'danger' : 'warn'}>
                      {request.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-4 text-[var(--muted)]">{formatDate(request.createdAt)}</td>
                  <td className="px-6 py-4 text-[var(--muted)]">{request.reviewNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
