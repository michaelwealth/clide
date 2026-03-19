'use client';


import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { CampaignStatusBadge } from './_components';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  campaign_key: string;
  status: string;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
}

export default function CampaignsContent() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    base_url: '',
    fallback_url: '',
    sms_template: '',
    start_at: '',
    end_at: '',
  });

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.campaigns.list(workspaceId, { status: statusFilter || undefined });
      setCampaigns(data.campaigns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, statusFilter]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const createCampaign = async () => {
    setCreating(true);
    setError('');
    try {
      await api.campaigns.create(workspaceId, form);
      setShowCreate(false);
      setForm({ name: '', base_url: '', fallback_url: '', sms_template: '', start_at: '', end_at: '' });
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
          <h1 className="font-display text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your link campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + New Campaign
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
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
            {s || 'All'}
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
        <div className="card divide-y divide-gray-100">
          {campaigns.map(campaign => (
            <Link
              key={campaign.id}
              href={`/w/${workspaceId}/campaigns/${campaign.id}`}
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-gray-900">{campaign.name}</span>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span>Key: {campaign.campaign_key}</span>
                  {campaign.start_at && (
                    <span>Start: {new Date(campaign.start_at).toLocaleDateString()}</span>
                  )}
                  {campaign.end_at && (
                    <span>End: {new Date(campaign.end_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
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
                <label className="label">Destination URL</label>
                <input
                  className="input"
                  type="url"
                  value={form.base_url}
                  onChange={e => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://example.com/landing"
                />
              </div>
              <div>
                <label className="label">Fallback URL</label>
                <input
                  className="input"
                  type="url"
                  value={form.fallback_url}
                  onChange={e => setForm({ ...form, fallback_url: e.target.value })}
                  placeholder="https://example.com/expired"
                />
              </div>
              <div>
                <label className="label">SMS Template (optional)</label>
                <textarea
                  className="input min-h-[80px]"
                  value={form.sms_template}
                  onChange={e => setForm({ ...form, sms_template: e.target.value })}
                  placeholder="Hi {firstname}, check out {link}"
                />
                <p className="text-xs text-gray-400 mt-1">Use {'{firstname}'} and {'{link}'} as variables</p>
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
