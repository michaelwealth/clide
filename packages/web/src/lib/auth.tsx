'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiError } from './api';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_super_admin: boolean;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  custom_domain: string | null;
}

interface AuthState {
  user: User | null;
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (returnTo?: string) => void;
  loginWithPassword: (email: string, password: string, returnTo?: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    workspaces: [],
    loading: true,
    error: null,
  });

  const refresh = async () => {
    try {
      const data = await api.auth.me();
      setState({
        user: data.user,
        workspaces: data.workspaces,
        loading: false,
        error: null,
      });
    } catch {
      // After OAuth callback, KV session may not have propagated yet. Retry once.
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      if (params?.get('from') === 'oauth') {
        params.delete('from');
        const cleanUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.replaceState({}, '', cleanUrl);
        await new Promise(r => setTimeout(r, 1500));
        try {
          const data = await api.auth.me();
          setState({
            user: data.user,
            workspaces: data.workspaces,
            loading: false,
            error: null,
          });
          return;
        } catch { /* fall through to unauthenticated state */ }
      }
      setState({ user: null, workspaces: [], loading: false, error: null });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = (returnTo?: string) => {
    window.location.href = api.auth.loginUrl(returnTo);
  };

  const loginWithPassword = async (email: string, password: string, returnTo?: string, turnstileToken?: string) => {
    const data = await api.auth.passwordLogin(email, password, returnTo, turnstileToken);
    setState({
      user: data.user,
      workspaces: data.workspaces,
      loading: false,
      error: null,
    });
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore logout errors
    }
    setState({ user: null, workspaces: [], loading: false, error: null });
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithPassword, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
