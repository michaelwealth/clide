'use client';


import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface ShortLink {
  id: string;
  slug: string;
  destination_url: string;
  title: string | null;
  clicks: number;
  is_active: number;
  expires_at: string | null;
  created_at: string;
}

export default function LinksContent() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');

  const fetchLinks = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.links.list(workspaceId, { page: String(page), limit: '50' });
      setLinks(res.links);
      setPagination(res.pagination);
    } catch {
      setError('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api.links.create(workspaceId, {
        url: formUrl,
        title: formTitle || undefined,
        slug: formSlug || undefined,
      });
      setFormUrl('');
      setFormTitle('');
      setFormSlug('');
      setShowCreate(false);
      await fetchLinks();
    } catch (err: any) {
      setError(err.message || 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    if (!confirm('Delete this short link?')) return;
    try {
      await api.links.delete(workspaceId, linkId);
      await fetchLinks(pagination.page);
    } catch {
      setError('Failed to delete link');
    }
  };

  const handleToggle = async (link: ShortLink) => {
    try {
      await api.links.update(workspaceId, link.id, { is_active: link.is_active ? false : true });
      await fetchLinks(pagination.page);
    } catch {
      setError('Failed to update link');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">Short Links</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pagination.total} link{pagination.total !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Link
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 mb-6">
          <h2 className="font-medium text-gray-900 mb-4">Create Short Link</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label text-xs">Destination URL *</label>
              <input
                type="url"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                className="input"
                placeholder="https://example.com/long-url"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Title (optional)</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="input"
                  placeholder="My Link"
                />
              </div>
              <div>
                <label className="label text-xs">Custom Slug (optional)</label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={e => setFormSlug(e.target.value)}
                  className="input"
                  placeholder="my-link"
                  pattern="[a-z0-9\-_]+"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={creating} className="btn-primary text-sm">
                {creating ? 'Creating…' : 'Create Link'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-4">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-48 bg-gray-100 rounded animate-pulse flex-1" />
                <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
                <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
                <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.74a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
          </svg>
          <p className="text-gray-500 text-sm">No short links yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm mt-3">
            Create your first link
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-left">
                <th className="px-4 py-3 font-medium text-gray-500">Link</th>
                <th className="px-4 py-3 font-medium text-gray-500">Destination</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Clicks</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Created</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {links.map(link => (
                <tr key={link.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-mono text-brand-600 font-medium">/{link.slug}</span>
                      {link.title && (
                        <p className="text-xs text-gray-400 mt-0.5">{link.title}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-gray-600">
                    {link.destination_url}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {link.clicks.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(link)}
                      className={`badge text-xs ${link.is_active ? 'badge-success' : 'badge-secondary'}`}
                    >
                      {link.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(link.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(link.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={pagination.page <= 1}
            onClick={() => fetchLinks(pagination.page - 1)}
            className="btn-ghost text-sm"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500 py-2">
            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button
            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
            onClick={() => fetchLinks(pagination.page + 1)}
            className="btn-ghost text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
