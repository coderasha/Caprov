'use client';

import type { AuthSession, MembershipRole, PublicUser } from '@caprov/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token?: string;
  user?: PublicUser;
  organization?: AuthSession['organization'];
  roles: MembershipRole[];
  hasHydrated: boolean;
  setSession: (session: AuthSession) => void;
  logout: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      roles: [],
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setSession: (session) =>
        set({
          token: session.token,
          user: session.user,
          organization: session.organization,
          roles: session.roles,
        }),
      logout: () =>
        set({
          token: undefined,
          user: undefined,
          organization: undefined,
          roles: [],
        }),
    }),
    {
      name: 'caprov-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        organization: state.organization,
        roles: state.roles,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
