import type { CSSProperties, ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
  // Keep authentication pages deployable in isolated/private environments;
  // next/font/google otherwise makes the production build depend on Google.
  return <div style={{ '--font-auth-serif': 'Georgia, "Times New Roman", serif' } as CSSProperties}>{children}</div>;
}
