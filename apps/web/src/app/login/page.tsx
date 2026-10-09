'use client';

import { CaprovWordmark } from '@/components/brand/caprov-logo';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import type { AuthSession } from '@caprov/types';
import axios from 'axios';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Lock,
  Mail,
  Shield,
  User,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

interface DemoAccount {
  email: string;
  password: string;
  name: string;
  role: string;
}

const DEFAULT_PERSONA: DemoAccount = {
  name: 'Jordan Lee',
  email: 'banker@caprov.demo',
  password: 'CaprovDemo!23',
  role: 'Banker',
};

const DEMO_PERSONAS: DemoAccount[] = [
  DEFAULT_PERSONA,
  {
    name: 'Priya Nair',
    email: 'priya@caprov.io',
    password: 'CaprovDemo!23',
    role: 'PLATFORM_ADMIN',
  },
  {
    name: 'Elena Voss',
    email: 'elena@meridian.caprov',
    password: 'CaprovDemo!23',
    role: 'ORG_ADMIN',
  },
  {
    name: 'Arjun Mehta',
    email: 'arjun@meridian.caprov',
    password: 'CaprovDemo!23',
    role: 'Buyer',
  },
  {
    name: 'Sofia Laurent',
    email: 'sofia@meridian.caprov',
    password: 'CaprovDemo!23',
    role: 'COMPLIANCE',
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: 'Verified Intelligence',
    detail: 'Document-backed asset DNA',
  },
  {
    icon: Boxes,
    title: 'Tokenized Ownership',
    detail: 'Fractional blockchain interests',
  },
  {
    icon: BarChart3,
    title: 'Access to Liquidity',
    detail: 'Secondary market trading',
  },
] as const;

const STATS = [
  { value: '1,200+', label: 'Private assets' },
  { value: '$12.4B+', label: 'Total asset value' },
  { value: '320+', label: 'Institutional investors' },
  { value: '25+', label: 'Countries' },
] as const;

function personaIcon(role: string) {
  const key = role.toUpperCase().replace(/\s+/g, '_');
  if (key.includes('PLATFORM')) return Users;
  if (key.includes('ORG') || key.includes('ORGANIZATION')) return Building2;
  if (key.includes('COMPLIANCE')) return Shield;
  return User;
}

function displayRole(role: string) {
  const normalized = role.trim();
  const map: Record<string, string> = {
    'Platform admin': 'PLATFORM_ADMIN',
    'Organization admin': 'ORG_ADMIN',
    Compliance: 'COMPLIANCE',
    Banker: 'Banker',
    Buyer: 'Buyer',
  };
  return map[normalized] ?? normalized;
}

function loginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Unable to sign in. Please try again.';
  }

  if (!error.response) {
    return 'Cannot reach the sign-in service. Start the API, then try again.';
  }

  if (error.response.status === 401) {
    return 'Invalid email or password.';
  }

  const message = error.response.data?.message;
  return Array.isArray(message)
    ? message.join(' ')
    : typeof message === 'string'
      ? message
      : 'Unable to sign in. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState(DEFAULT_PERSONA.email);
  const [password, setPassword] = useState(DEFAULT_PERSONA.password);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(DEFAULT_PERSONA.email);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demos, setDemos] = useState<DemoAccount[]>(DEMO_PERSONAS);

  useEffect(() => {
    api
      .get<DemoAccount[]>('/auth/demo-accounts')
      .then((response) => {
        if (response.data.length > 0) setDemos(response.data);
      })
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
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn();
  }

  return (
    <main className="auth-login">
      <section className="auth-login__brand" aria-label="CAPROV platform overview">
        <div className="auth-login__brand-media" aria-hidden="true">
          <Image
            src="/login-hero-skyline.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="auth-login__brand-image"
          />
          <div className="auth-login__brand-shade" />
        </div>

        <div className="auth-login__brand-content">
          <Link href="/" className="auth-login__brand-logo">
            <CaprovWordmark
              tone="dark"
              variant="full"
              priority
              className="h-10 max-h-10 w-auto max-w-[12.5rem]"
            />
          </Link>

          <div className="auth-login__brand-body">
            <p className="auth-login__eyebrow">
              Verified assets. Liquid markets. Real opportunities.
            </p>
            <h1 className="auth-login__headline">
              Private asset intelligence.{' '}
              <span className="auth-login__headline-accent">Built on trust.</span>
            </h1>
            <p className="auth-login__lead">
              Access institutional-grade private market opportunities through verified asset
              intelligence, document extraction, tokenization, and blockchain-secured ownership.
            </p>

            <ul className="auth-login__features">
              {FEATURES.map((feature) => (
                <li key={feature.title}>
                  <span className="auth-login__feature-icon" aria-hidden="true">
                    <feature.icon />
                  </span>
                  <span>
                    <strong>{feature.title}</strong>
                    <span>{feature.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="auth-login__stats">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.value}</dt>
                <dd>{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="auth-login__panel">
        <div className="auth-login__panel-pattern" aria-hidden="true" />

        <div className="auth-login__card">
          <div className="auth-login__card-header">
            <CaprovWordmark
              tone="light"
              variant="full"
              priority
              className="h-9 max-h-9 w-auto max-w-[11.5rem]"
            />
            <h2 className="auth-login__card-title">Sign in</h2>
            <p className="auth-login__card-subtitle">Access your private asset workspace</p>
          </div>

          <form className="auth-login__form" onSubmit={onSubmit}>
            <label className="auth-login__field">
              <span>Email</span>
              <span className="auth-login__control">
                <Mail aria-hidden="true" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label className="auth-login__field">
              <span>Password</span>
              <span className="auth-login__control">
                <Lock aria-hidden="true" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-login__reveal"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </label>

            <div className="auth-login__forgot-row">
              <button type="button" className="auth-login__forgot">
                Forgot password?
              </button>
            </div>

            {error ? <p className="auth-login__error">{error}</p> : null}

            <button type="submit" className="auth-login__submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Continue'}
              {!loading ? <ArrowRight aria-hidden="true" /> : null}
            </button>
          </form>

          {demos.length > 0 ? (
            <>
              <div className="auth-login__divider" role="separator">
                <span>or</span>
              </div>

              <div className="auth-login__demos">
                <p className="auth-login__demos-label">Enter as a demo persona</p>
                <p className="auth-login__demos-help">
                  Choose a role to sign in with its access level.
                </p>
                <div className="auth-login__demo-list">
                  {demos.map((account) => {
                    const Icon = personaIcon(account.role);
                    const active = selectedEmail === account.email;
                    return (
                      <button
                        key={account.email}
                        type="button"
                        className={cn('auth-login__demo', active && 'auth-login__demo--active')}
                        disabled={loading}
                        onClick={() => {
                          setSelectedEmail(account.email);
                          setEmail(account.email);
                          setPassword(account.password);
                          void signIn(account.email, account.password);
                        }}
                      >
                        <span className="auth-login__demo-icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="auth-login__demo-copy">
                          <strong>{account.name}</strong>
                          <span>{displayRole(account.role)}</span>
                        </span>
                        <ChevronRight className="auth-login__demo-chevron" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}

          <p className="auth-login__footer">
            New firm?{' '}
            <Link href="/register">Request organization access</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
