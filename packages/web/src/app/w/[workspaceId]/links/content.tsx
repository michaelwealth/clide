'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { InfoTip, GuideBox } from '@/components/info-tip';

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
  const [search, setSearch] = useState('');
  const [selectedLink, setSelectedLink] = useState<ShortLink | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Form state
  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [useUtm, setUseUtm] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [utmContent, setUtmContent] = useState('');

  const fetchLinks = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const res = await api.links.list(workspaceId, {
        page: String(page),
        limit: '50',
        ...(search ? { q: search } : {}),
      });
      setLinks(res.links);
      setPagination(res.pagination);
    } catch {
      setError('Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, search]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const finalUrl = buildUrlWithUtm(formUrl, {
        source: utmSource,
        medium: utmMedium,
        campaign: utmCampaign,
        term: utmTerm,
        content: utmContent,
      }, useUtm);

      await api.links.create(workspaceId, {
        url: finalUrl,
        title: formTitle || undefined,
        slug: formSlug || undefined,
      });
      setFormUrl('');
      setFormTitle('');
      setFormSlug('');
      setUseUtm(false);
      setUtmSource('');
      setUtmMedium('');
      setUtmCampaign('');
      setUtmTerm('');
      setUtmContent('');
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

  const openLinkActions = (link: ShortLink) => {
    setSelectedLink(link);
    setShowLinkModal(true);
  };

  const copyShortUrl = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`https://s.cmaf.cc/${slug}`);
    } catch {
      setError('Failed to copy link');
    }
  };

  const downloadQr = async (slug: string) => {
    try {
      const shortUrl = `https://s.cmaf.cc/${slug}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(shortUrl)}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not generate QR code'));
        img.src = qrUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 700;
      canvas.height = 820;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 50, 40, 600, 600);

      ctx.fillStyle = '#111827';
      ctx.font = '24px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(shortUrl, canvas.width / 2, 700);

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${slug}-qr.png`;
      a.click();
    } catch (err: any) {
      setError(err?.message || 'Failed to download QR code');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Short Links
            <InfoTip text="Standalone short links not tied to a campaign. Use these for one-off URLs, social media posts, or email signatures. For campaign-based links with SMS dispatch, create a Campaign instead." />
          </h1>
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

      <div className="mb-4">
        <input
          className="input w-full sm:w-80"
          placeholder="Search slug, destination URL, or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-5 mb-6">
          <h2 className="font-medium text-gray-900 mb-4">Create Short Link</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="label text-xs">
                Destination URL *
                <InfoTip text="The full URL that this short link will redirect to when someone clicks it." />
              </label>
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
                <label className="label text-xs">Name (optional)</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="input"
                  placeholder="Spring Promo Landing Page"
                />
              </div>
              <div>
                <label className="label text-xs">
                  Custom Slug (optional)
                  <InfoTip text="A custom slug like 'my-link' creates s.cmaf.cc/my-link. Leave empty for an auto-generated slug." />
                </label>
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

            <div className="border rounded-lg border-gray-200 p-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <input
                  type="checkbox"
                  checked={useUtm}
                  onChange={(e) => setUseUtm(e.target.checked)}
                />
                Enable detailed UTM generator
              </label>

              {useUtm && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input className="input" placeholder="utm_source (e.g. whatsapp)" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} />
                  <input className="input" placeholder="utm_medium (e.g. sms)" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} />
                  <input className="input" placeholder="utm_campaign (e.g. march_launch)" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} />
                  <input className="input" placeholder="utm_term (optional)" value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} />
                  <input className="input sm:col-span-2" placeholder="utm_content (optional)" value={utmContent} onChange={(e) => setUtmContent(e.target.value)} />
                </div>
              )}
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
                      <button
                        onClick={() => openLinkActions(link)}
                        className="font-mono text-brand-600 font-medium hover:underline"
                      >
                        https://s.cmaf.cc/{link.slug}
                      </button>
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
                    <div className="inline-flex items-end gap-4">
                      <IconAction label="QR" onClick={() => downloadQr(link.slug)}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2m2 0h2m-6 3h6m-6 3h2m2 0h2" />
                        </svg>
                      </IconAction>
                      <IconAction
                        label="Edit"
                        onClick={() => {
                          setSelectedLink(link);
                          setShowEditModal(true);
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487a2.1 2.1 0 113.03 2.898L9.7 18.017l-4.2 1.05 1.05-4.2L16.862 4.487z" />
                        </svg>
                      </IconAction>
                      <IconAction label="Delete" onClick={() => handleDelete(link.id)} danger>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 4v6m4-6v6m4-6v6M5 7l1 12h12l1-12" />
                        </svg>
                      </IconAction>
                    </div>
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

      {showLinkModal && selectedLink && (
        <ActionModal title="Short Link Actions" onClose={() => setShowLinkModal(false)}>
          <p className="text-xs text-gray-500 mb-2">Selected short link</p>
          <p className="font-mono text-sm text-brand-700 break-all mb-4">https://s.cmaf.cc/{selectedLink.slug}</p>
          <div className="grid grid-cols-1 gap-2">
            <a
              href={`https://s.cmaf.cc/${selectedLink.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm"
            >
              Visit Link
            </a>
            <button
              onClick={() => copyShortUrl(selectedLink.slug)}
              className="btn-secondary text-sm"
            >
              Copy Link
            </button>
            <button
              onClick={() => {
                setShowLinkModal(false);
                setShowEditModal(true);
              }}
              className="btn-primary text-sm"
            >
              Edit Link
            </button>
          </div>
        </ActionModal>
      )}

      {showEditModal && selectedLink && (
        <EditLinkModal
          link={selectedLink}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => {
            setShowEditModal(false);
            await fetchLinks(pagination.page);
          }}
          onSave={async (payload) => {
            await api.links.update(workspaceId, selectedLink.id, payload);
          }}
        />
      )}
    </div>
  );
}

function ActionModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function EditLinkModal({
  link,
  onClose,
  onSaved,
  onSave,
}: {
  link: ShortLink;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSave: (payload: { destination_url: string; title?: string; is_active: boolean }) => Promise<void>;
}) {
  const [destinationUrl, setDestinationUrl] = useState(link.destination_url);
  const [title, setTitle] = useState(link.title || '');
  const [isActive, setIsActive] = useState(!!link.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ destination_url: destinationUrl, title: title || undefined, is_active: isActive });
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ActionModal title="Edit Short Link" onClose={onClose}>
      {error && <div className="mb-3 p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      <div className="space-y-3">
        <div>
          <label className="label text-xs">Short URL</label>
          <p className="text-xs font-mono text-brand-700">https://s.cmaf.cc/{link.slug}</p>
        </div>
        <div>
          <label className="label text-xs">Destination URL</label>
          <input className="input" type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Name</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Link is active
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save'}</button>
      </div>
    </ActionModal>
  );
}

function IconAction({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-col items-center gap-1 ${danger ? 'text-red-500 hover:text-red-700' : 'text-gray-600 hover:text-brand-700'}`}
      title={label}
    >
      <span>{children}</span>
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}

function buildUrlWithUtm(
  baseUrl: string,
  utm: { source: string; medium: string; campaign: string; term: string; content: string },
  enabled: boolean,
): string {
  if (!enabled) return baseUrl;
  const url = new URL(baseUrl);
  if (utm.source) url.searchParams.set('utm_source', utm.source);
  if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
  if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
  if (utm.term) url.searchParams.set('utm_term', utm.term);
  if (utm.content) url.searchParams.set('utm_content', utm.content);
  return url.toString();
}
