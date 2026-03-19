'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { GuideBox } from '@/components/info-tip';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.admin.users.list();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteUser = async (userId: string) => {
    try {
      await api.admin.users.delete(userId);
      setShowDeleteModal(false);
      setDeletingUser(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const filteredUsers = users.filter((u: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">Users</h1>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          + Invite User
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <GuideBox>
        Invite users first, then assign them to workspaces with the appropriate role (admin, operator, or viewer).
      </GuideBox>

      <div className="mb-4">
        <input
          className="input w-full sm:w-80"
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Workspaces</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filteredUsers.length ? (
              filteredUsers.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatar_url && (
                        <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                      )}
                      <span className="font-medium text-gray-900">{u.name || '—'}</span>
                      {u.is_super_admin && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Super</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.memberships?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {u.memberships.map((m: any) => (
                          <span key={m.workspace_id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {m.workspace_name} ({m.role})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {!u.is_super_admin && (
                      <button
                        onClick={() => { setDeletingUser(u); setShowDeleteModal(true); }}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No users</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <InviteUserModal onClose={() => { setShowInvite(false); load(); }} />
      )}

      {showDeleteModal && deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setShowDeleteModal(false); setDeletingUser(null); }}>
          <div className="card w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-display text-lg font-semibold mb-4">Delete User</h2>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deletingUser.name || deletingUser.email}</strong>? This will remove them from all workspaces.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeletingUser(null); }} className="btn-secondary">Cancel</button>
              <button onClick={() => deleteUser(deletingUser.id)} className="btn-danger">Delete User</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteUserModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.admin.users.invite({ email, name: name.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold mb-4">Invite User</h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <form onSubmit={invite} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@commercium.africa"
            />
            <p className="text-xs text-gray-400 mt-1">Must be @commercium.africa domain</p>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Inviting…' : 'Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
