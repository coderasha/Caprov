import { Playfair_Display } from 'next/font/google';
import type { ReactNode } from 'react';

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-auth-serif',
  display: 'swap',
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <div className={playfair.variable}>{children}</div>;
}
