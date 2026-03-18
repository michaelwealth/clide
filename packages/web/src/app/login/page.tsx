'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login, loginWithPassword, user, workspaces, loading } = useAuth();
  const router = useRouter();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!loading && user) {
    if (workspaces.length > 0) {
      router.replace(`/w/${workspaces[0].id}/dashboard`);
    } else {
      router.replace('/');
    }
    return null;
  }

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await loginWithPassword(email, password);
      router.replace('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Hero/Brand */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gray-950">
        {/* Gradient orbs */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute top-1/2 -right-20 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 w-72 h-72 rounded-full bg-brand-400/15 blur-3xl" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.74a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                </svg>
              </div>
              <span className="font-display text-xl font-bold text-white tracking-tight">CLiDE</span>
            </div>
          </div>

          <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <h1 className="font-display text-5xl font-bold text-white leading-tight mb-6">
              Shorten. Dispatch.
              <br />
              <span className="text-brand-400">Track everything.</span>
            </h1>
            <p className="text-lg text-gray-400 max-w-lg leading-relaxed">
              Multi-tenant link management and SMS dispatch engine. Create branded short links,
              run campaigns, and trigger automated messages — all from one dashboard.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-3 mt-8">
              {['Branded Domains', 'SMS Campaigns', 'Click Triggers', 'Real-time Analytics', 'Multi-tenant'].map((f) => (
                <span
                  key={f}
                  className="px-3 py-1.5 text-xs font-medium text-gray-300 rounded-full border border-gray-700/60 bg-gray-800/40"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <p
            className="text-xs text-gray-600 select-none cursor-default"
            onDoubleClick={() => setShowPasswordForm((v) => !v)}
          >
            &copy; {new Date().getFullYear()} Commercium Technologies
          </p>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12 lg:px-12">
        <div className={`w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {/* Mobile brand header */}
          <div className="lg:hidden mb-10 text-center">
            <div className="inline-flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.74a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                </svg>
              </div>
              <span className="font-display text-lg font-bold text-gray-900">CLiDE</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-gray-900 mb-2">Welcome back</h2>
            <p className="text-sm text-gray-500">Sign in with your organization account to continue</p>
          </div>

          {/* Google Sign-in Button */}
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-150 shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" />
            <span>Restricted to @commercium.africa</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Trust indicators */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="flex flex-col items-center py-3 rounded-lg bg-gray-50">
              <svg className="w-4 h-4 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-[10px] text-gray-500 font-medium">Encrypted</span>
            </div>
            <div className="flex flex-col items-center py-3 rounded-lg bg-gray-50">
              <svg className="w-4 h-4 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span className="text-[10px] text-gray-500 font-medium">SSO Protected</span>
            </div>
            <div className="flex flex-col items-center py-3 rounded-lg bg-gray-50">
              <svg className="w-4 h-4 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
              </svg>
              <span className="text-[10px] text-gray-500 font-medium">Edge-first</span>
            </div>
          </div>

          {/* Hidden password form */}
          {showPasswordForm && (
            <form onSubmit={handlePasswordLogin} className="space-y-3 animate-in">
              <div className="border-t border-gray-200 pt-5 mb-4">
                <p className="text-xs font-medium text-gray-500 mb-3">Developer Access</p>
              </div>
              <div>
                <label className="label text-xs">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="admin@commercium.africa"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label text-xs">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2.5 text-sm"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Mobile footer */}
          <p
            className="mt-8 text-center text-[11px] text-gray-400 select-none cursor-default lg:hidden"
            onDoubleClick={() => setShowPasswordForm((v) => !v)}
          >
            &copy; {new Date().getFullYear()} Commercium Technologies
          </p>
        </div>
      </div>
    </div>
  );
}
