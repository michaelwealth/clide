'use client';

export const runtime = 'edge';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';

const DEFAULT_WS_KEY = 'clide_default_workspace';

export default function HomePage() {
  const { user, workspaces, loading, refresh, logout } = useAuth();
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const canCreateWorkspace = useMemo(() => {
    if (!user) return false;
    if (user.is_super_admin) return true;
    return workspaces.some((w) => w.role === 'admin' || w.role === 'owner');
  }, [user, workspaces]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const savedWs = localStorage.getItem(DEFAULT_WS_KEY);
    if (savedWs && workspaces.find((w) => w.id === savedWs)) {
      router.replace(`/w/${savedWs}/dashboard`);
      return;
    }

    // No valid default selected: always show chooser.
    setChoosing(true);
  }, [user, workspaces, loading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectWorkspace = (wsId: string, setDefault: boolean) => {
    if (setDefault) {
      localStorage.setItem(DEFAULT_WS_KEY, wsId);
    }
    router.replace(`/w/${wsId}/dashboard`);
  };

  const createWorkspace = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const slug = createSlug.trim() || createName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const res = await api.workspaces.create({
        name: createName.trim(),
        slug,
      });
      await refresh();
      setShowCreate(false);
      setCreateName('');
      setCreateSlug('');
      router.replace(`/w/${res.workspace.id}/dashboard`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  if (choosing && user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 shrink-0">
          <Link href="/" className="font-display text-xl font-bold text-brand-700">CLiDE</Link>
          <div className="flex-1" />
          <Link href="/docs" className="mr-3 text-sm font-medium text-gray-600 hover:text-brand-700">
            Docs
          </Link>
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-white" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold ring-2 ring-white">
                  {user.name[0]}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">{user.name.split(' ')[0]}</span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 animate-in">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  <Link href="/docs" className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                    Documentation
                  </Link>
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button onClick={logout} className="flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left">
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.74a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
                </svg>
              </div>
              <h1 className="font-display text-2xl font-bold text-gray-900">Choose Workspace</h1>
              <p className="text-sm text-gray-500 mt-1">Select a workspace to continue</p>
            </div>

            {workspaces.length > 0 ? (
              <div className="space-y-3">
                {workspaces.map((w) => (
                  <WorkspaceCard
                    key={w.id}
                    workspace={w}
                    onSelect={(setDefault) => selectWorkspace(w.id, setDefault)}
                  />
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <p className="text-sm text-gray-600">No workspace assigned to your account yet.</p>
              </div>
            )}

            <div className="mt-5 flex items-center justify-center gap-3">
              {canCreateWorkspace && (
                <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
                  + Create Workspace
                </button>
              )}
            </div>

            <div className="mt-8 text-center">
              <p className="text-[12px] md:text-[14px]text-gray-400 leading-relaxed">Made with <span className="text-red-400">❤</span> by CAL Digital Team</p>

              <p className="text-xs text-gray-400 text-center mt-5">
                No default selected yet: this chooser will continue to appear on login.
              </p>
            </div>
          </div>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreate(false)}>
            <div className="card w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-lg font-semibold mb-4">Create Workspace</h2>
              {createError && <p className="text-red-600 text-sm mb-3">{createError}</p>}
              <div className="space-y-3">
                <div>
                  <label className="label">Workspace Name</label>
                  <input
                    className="input"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Lagos Events Team"
                  />
                </div>
                <div>
                  <label className="label">Slug (optional)</label>
                  <input
                    className="input"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    placeholder="lagos-events"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
                <button
                  onClick={createWorkspace}
                  disabled={creating || !createName.trim()}
                  className="btn-primary text-sm"
                >
                  {creating ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 animate-pulse">
      <div className="max-w-6xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-72 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-5">
              <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const WS_COLORS = [
  'bg-amber-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500',
  'bg-emerald-500', 'bg-violet-500', 'bg-sky-500', 'bg-orange-500',
];

function getColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return WS_COLORS[Math.abs(hash) % WS_COLORS.length];
}

function WorkspaceCard({ workspace, onSelect }: { workspace: { id: string; name: string; slug: string; role: string }; onSelect: (setDefault: boolean) => void }) {
  return (
    <div className="card p-4 flex items-center gap-4 hover:border-brand-200 transition-colors">
      <div className={`w-10 h-10 rounded-lg ${getColor(workspace.id)} flex items-center justify-center text-white text-lg font-bold shrink-0`}>
        {workspace.name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{workspace.name}</p>
        <p className="text-xs text-gray-400 capitalize">{workspace.role}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={() => onSelect(false)} className="btn-secondary text-xs px-3 py-1.5">
          Open
        </button>
        <button onClick={() => onSelect(true)} className="btn-primary text-xs px-3 py-1.5">
          Set Default
        </button>
      </div>
    </div>
  );
}
