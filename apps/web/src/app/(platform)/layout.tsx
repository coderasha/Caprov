import { AppShell } from '@/components/layout/app-shell';
import type { ReactNode } from 'react';

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
