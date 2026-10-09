'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function CompliancePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Compliance"
        description="Review KYC readiness, document exceptions, and control checks across the organization."
      />
      <Card className="p-6">
        <p className="text-sm leading-6 text-[var(--muted)]">
          Compliance workflows surface ownership evidence, elevated risk flags, and approval gates before
          markets or credit actions proceed.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link href="/documents" className="font-medium text-[var(--ink)] underline underline-offset-4">
            Review documents
          </Link>
          <Link href="/audit" className="font-medium text-[var(--ink)] underline underline-offset-4">
            Open audit trail
          </Link>
        </div>
      </Card>
    </div>
  );
}
