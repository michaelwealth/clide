'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { CampaignStatusBadge } from './_components';
import Link from 'next/link';
import { InfoTip, GuideBox } from '@/components/info-tip';

interface Campaign {
  id: string;
  name: string;
  campaign_key: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
}

function formatDateTimeParts(value: string) {
  const dt = new Date(value);
  return {
    date: dt.toLocaleDateString('en-GB'),
    time: dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

export default function CampaignsContent() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    base_url: '',
    fallback_url: '',
    sms_template: '',
    disable_shortlink_generation: false,
    start_at: '',
    end_at: '',
  });

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.campaigns.list(workspaceId, {
        status: statusFilter || undefined,
        q: search || undefined,
      });
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter, search]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const createCampaign = async () => {
    setCreating(true);
    setError('');
    try {
      await api.campaigns.create(workspaceId, form);
      setShowCreate(false);
      setForm({ name: '', base_url: '', fallback_url: '', sms_template: '', disable_shortlink_generation: false, start_at: '', end_at: '' });
      loadCampaigns();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Campaigns
            <InfoTip text="A campaign groups contacts, short links, and SMS messages together. Create a campaign, set the destination URL (with optional personalization parameters), upload a CSV of contacts, and dispatch SMS." />
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage your link campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Campaign
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          className="input w-64"
          placeholder="Search campaign name or key..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {['', 'draft', 'scheduled', 'active', 'paused', 'expired'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-brand-50 border-brand-200 text-brand-700'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {s === '' ? 'All' : s === 'expired' ? 'History' : s}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="card divide-y">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No campaigns yet</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            Create your first campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {campaigns.map(campaign => {
            const created = formatDateTimeParts(campaign.created_at);
            return (
              <Link
                key={campaign.id}
                href={`/w/${workspaceId}/campaigns/${campaign.id}`}
                className="card p-4 hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-[11px] text-gray-400 leading-tight">
                    <p>{created.date}</p>
                    <p>{created.time}</p>
                  </div>
                  <CampaignStatusBadge status={campaign.status} />
                </div>

                <h3 className="font-display text-base font-semibold text-gray-900 truncate">
                  {campaign.name}
                </h3>

                <p className="mt-1 text-xs text-gray-400 font-mono truncate">
                  {campaign.campaign_key}
                </p>

                <div className="mt-3 space-y-1 text-[11px] text-gray-500">
                  <p className="truncate">Last edited: {new Date(campaign.updated_at).toLocaleString()}</p>
                  <p>Start: {campaign.start_at ? new Date(campaign.start_at).toLocaleDateString('en-GB') : '—'}</p>
                  <p>End: {campaign.end_at ? new Date(campaign.end_at).toLocaleDateString('en-GB') : '—'}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="card w-full max-w-lg mx-4 p-6">
            <h2 className="font-display text-lg font-semibold mb-4">Create Campaign</h2>
            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

            <div className="space-y-4">
              <div>
                <label className="label">Campaign Name</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. March Product Launch"
                />
              </div>
              <div>
                <label className="label">
                  Destination URL
                  <InfoTip text="The URL each contact's short link will redirect to. Use {column_name} placeholders to personalize — e.g. https://example.com?name={firstname}&city={city}. Column names must match your CSV headers." />
                </label>
                <input
                  className="input"
                  type="url"
                  value={form.base_url}
                  onChange={e => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://example.com/landing?name={firstname}"
                />
                {form.base_url && /\{\w+\}/.test(form.base_url) && (
                  <p className="text-xs text-brand-600 mt-1">
                    Parameters detected: {(form.base_url.match(/\{(\w+)\}/g) || []).map(p => p).join(', ')}
                  </p>
                )}
              </div>
              <div>
                <label className="label">
                  Fallback URL
                  <InfoTip text="If the campaign expires or is paused, short links will redirect here instead of the destination URL." />
                </label>
                <input
                  className="input"
                  type="url"
                  value={form.fallback_url}
                  onChange={e => setForm({ ...form, fallback_url: e.target.value })}
                  placeholder="https://example.com/expired"
                />
              </div>
              <div>
                <label className="label">
                  SMS Template (optional)
                  <InfoTip text="The message sent to each contact via SMS. Use {firstname} for their name and {link} for their personalized short link. You can also use any CSV column name as a variable." />
                </label>
                <textarea
                  className="input min-h-[80px]"
                  value={form.sms_template}
                  onChange={e => setForm({ ...form, sms_template: e.target.value })}
                  placeholder="Hi {firstname}, check out {link}"
                />
                <p className="text-xs text-gray-400 mt-1">Variables: {'{firstname}'}, {'{link}'}, or any CSV column name like {'{email}'}, {'{city}'}</p>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.disable_shortlink_generation}
                    onChange={e => setForm({ ...form, disable_shortlink_generation: e.target.checked })}
                  />
                  Disable shortlink generation for this campaign
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Contacts will still upload and SMS personalization will still work, but no campaign links will be created.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date (optional)</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.start_at}
                    onChange={e => setForm({ ...form, start_at: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">End Date (optional)</label>
                  <input
                    className="input"
                    type="datetime-local"
                    value={form.end_at}
                    onChange={e => setForm({ ...form, end_at: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={createCampaign} disabled={creating || !form.name || !form.base_url || !form.fallback_url} className="btn-primary">
                {creating ? 'Creating…' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
