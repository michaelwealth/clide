'use client';

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';

export default function ContactsPage() {
  const { workspaceId, campaignId } = useParams() as { workspaceId: string; campaignId: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const page = parseInt(searchParams.get('page') || '1');
  const smsFilter = searchParams.get('sms_status') || '';
  const clickFilter = searchParams.get('click_status') || '';
  const search = searchParams.get('q') || '';

  const [data, setData] = useState<any>(null);
  const [campaignName, setCampaignName] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(search);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsData, campaignData] = await Promise.all([
        api.contacts.list(workspaceId, campaignId, {
          page: String(page),
          limit: '50',
          ...(smsFilter && { sms_status: smsFilter }),
          ...(clickFilter && { click_status: clickFilter }),
          ...(search && { search }),
        }),
        api.campaigns.get(workspaceId, campaignId),
      ]);
      setData(contactsData);
      setCampaignName(campaignData.campaign?.name || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, campaignId, page, smsFilter, clickFilter, search]);

  useEffect(() => { load(); }, [load]);

  const updateFilters = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value) newParams.set(key, value);
      else newParams.delete(key);
    }
    if (!params.page) newParams.set('page', '1');
    router.push(`?${newParams.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const url = api.contacts.exportUrl(workspaceId, campaignId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${campaignId}.csv`;
      a.click();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = data?.pagination ? Math.ceil(data.pagination.total / data.pagination.limit) : 0;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link href={`/w/${workspaceId}/campaigns`} className="hover:text-gray-600">Campaigns</Link>
        <span>/</span>
        <Link href={`/w/${workspaceId}/campaigns/${campaignId}`} className="hover:text-gray-600">{campaignName || '…'}</Link>
        <span>/</span>
        <span className="text-gray-700">Contacts</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-gray-900">Contacts</h1>
        <button onClick={exportCsv} disabled={exporting} className="btn-secondary text-sm">
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            className="input w-60"
            placeholder="Search name or phone…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          <button type="submit" className="btn-secondary text-sm">Search</button>
        </form>

        <select
          className="input w-40"
          value={smsFilter}
          onChange={e => updateFilters({ sms_status: e.target.value })}
        >
          <option value="">All SMS</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="not_sent">No SMS</option>
        </select>

        <select
          className="input w-40"
          value={clickFilter}
          onChange={e => updateFilters({ click_status: e.target.value })}
        >
          <option value="">All Clicks</option>
          <option value="clicked">Clicked</option>
          <option value="not_clicked">Not Clicked</option>
        </select>

        {(smsFilter || clickFilter || search) && (
          <button
            className="text-sm text-gray-400 hover:text-gray-600"
            onClick={() => { setSearchInput(''); updateFilters({ sms_status: '', click_status: '', q: '' }); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Short Link</th>
                <th className="px-4 py-3">SMS Status</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Last Click</th>
                <th className="px-4 py-3">Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : data?.contacts?.length ? (
                data.contacts.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.firstname}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                    <td className="px-4 py-3">
                      {c.slug ? (
                        <code className="text-xs text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                          {c.campaign_key}/{c.slug}
                        </code>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <SmsStatusBadge status={c.sms_status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.click_count ?? 0}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.last_click_at ? new Date(c.last_click_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {c.trigger_status ? (
                        <span className={`text-xs ${c.trigger_status === 'fired' ? 'text-green-600' : 'text-gray-400'}`}>
                          {c.trigger_status}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    No contacts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} · {data.pagination.total} contacts
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => updateFilters({ page: String(page + 1) })}
                className="btn-secondary text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SmsStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-300">—</span>;
  const map: Record<string, string> = {
    pending: 'badge-gray',
    queued: 'badge-blue',
    sent: 'badge-blue',
    delivered: 'badge-green',
    failed: 'badge-red',
  };
  return <span className={`${map[status] || 'badge-gray'} text-xs`}>{status}</span>;
}
