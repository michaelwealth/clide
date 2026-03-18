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
}

interface AuthState {
  user: User | null;
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: () => void;
  loginWithPassword: (email: string, password: string) => Promise<void>;
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
      setState({ user: null, workspaces: [], loading: false, error: null });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = () => {
    window.location.href = api.auth.loginUrl();
  };

  const loginWithPassword = async (email: string, password: string) => {
    const data = await api.auth.passwordLogin(email, password);
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
