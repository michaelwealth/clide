'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';

export default function AdminWorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.workspaces.list();
      setWorkspaces(data.workspaces);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredWorkspaces = workspaces.filter((ws: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (ws.name || '').toLowerCase().includes(q) || (ws.slug || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">Workspaces</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + Create Workspace
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="mb-4">
        <input
          className="input w-full sm:w-80"
          placeholder="Search workspaces by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Campaigns</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filteredWorkspaces.length ? (
              filteredWorkspaces.map((ws: any) => (
                <tr key={ws.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{ws.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{ws.slug}</td>
                  <td className="px-4 py-3 text-gray-600">{ws.member_count ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{ws.campaign_count ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(ws.created_at).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No workspaces</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateWorkspaceModal onClose={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.workspaces.create({ name, slug: slug || '' });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold mb-4">Create Workspace</h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Slug (optional)</label>
            <input className="input" value={slug} onChange={e => setSlug(e.target.value)} placeholder="auto-generated" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
