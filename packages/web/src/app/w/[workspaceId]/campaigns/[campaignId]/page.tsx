'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';

export default function CampaignDetailPage() {
  const { workspaceId, campaignId } = useParams() as { workspaceId: string; campaignId: string };
  const [campaign, setCampaign] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [showSmsConfirm, setShowSmsConfirm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showTriggerForm, setShowTriggerForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [campData, triggerData] = await Promise.all([
        api.campaigns.get(workspaceId, campaignId),
        api.triggers.list(workspaceId, campaignId),
      ]);
      setCampaign(campData.campaign);
      setStats(campData.stats);
      setTriggers(triggerData.triggers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, campaignId]);

  useEffect(() => { load(); }, [load]);

  const performAction = async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading('');
    }
  };

  const sendSms = () => performAction('sms', () => api.sms.send(workspaceId, campaignId, { send_all: true }));

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-96" />
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-red-600">{error || 'Campaign not found'}</div>;
  }

  const statusBadge = (status: string) => {
    const classes: Record<string, string> = {
      draft: 'badge-gray', scheduled: 'badge-blue', active: 'badge-green',
      paused: 'badge-yellow', expired: 'badge-red',
    };
    return <span className={`${classes[status] || 'badge-gray'} text-sm`}>{status}</span>;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href={`/w/${workspaceId}/campaigns`} className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
            ← Back to Campaigns
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-gray-900">{campaign.name}</h1>
            {statusBadge(campaign.status)}
          </div>
          <p className="text-sm text-gray-500 mt-1">Campaign key: <code className="text-brand-600">{campaign.campaign_key}</code></p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {campaign.status === 'draft' && (
            <button
              onClick={() => performAction('schedule', () => api.campaigns.schedule(workspaceId, campaignId))}
              disabled={!!actionLoading}
              className="btn-secondary"
            >
              {actionLoading === 'schedule' ? '…' : 'Schedule'}
            </button>
          )}
          {campaign.status === 'scheduled' && (
            <button
              onClick={() => performAction('activate', () => api.campaigns.activate(workspaceId, campaignId))}
              disabled={!!actionLoading}
              className="btn-primary"
            >
              {actionLoading === 'activate' ? '…' : 'Activate'}
            </button>
          )}
          {campaign.status === 'active' && (
            <>
              <button
                onClick={() => performAction('pause', () => api.campaigns.pause(workspaceId, campaignId))}
                disabled={!!actionLoading}
                className="btn-secondary"
              >
                Pause
              </button>
              <button onClick={() => setShowSmsConfirm(true)} className="btn-primary">
                Send SMS
              </button>
            </>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => performAction('activate', () => api.campaigns.activate(workspaceId, campaignId))}
              disabled={!!actionLoading}
              className="btn-primary"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Contacts</p>
          <p className="font-display text-xl font-bold mt-1">{stats?.contacts ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Links</p>
          <p className="font-display text-xl font-bold mt-1">{stats?.links ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Clicks</p>
          <p className="font-display text-xl font-bold mt-1">{stats?.clicks ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">SMS Sent</p>
          <p className="font-display text-xl font-bold mt-1">{stats?.sms_sent ?? 0}</p>
        </div>
      </div>

      {/* Campaign Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Destination URL</dt>
              <dd className="text-gray-900 truncate ml-4 max-w-[250px]">{campaign.base_url}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Fallback URL</dt>
              <dd className="text-gray-900 truncate ml-4 max-w-[250px]">{campaign.fallback_url}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Start</dt>
              <dd className="text-gray-900">{campaign.start_at ? new Date(campaign.start_at).toLocaleString() : '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">End</dt>
              <dd className="text-gray-900">{campaign.end_at ? new Date(campaign.end_at).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">SMS Template</h2>
          {campaign.sms_template ? (
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{campaign.sms_template}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">No SMS template configured</p>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex gap-4 mb-8">
        <Link
          href={`/w/${workspaceId}/campaigns/${campaignId}/contacts`}
          className="btn-secondary"
        >
          View Contacts ({stats?.contacts ?? 0})
        </Link>
        <button onClick={() => setShowUpload(true)} className="btn-secondary">
          Upload CSV
        </button>
        <button onClick={() => setShowTriggerForm(true)} className="btn-secondary">
          + Add Trigger
        </button>
      </div>

      {/* Triggers */}
      {triggers.length > 0 && (
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Trigger Rules</h2>
          <div className="divide-y divide-gray-100">
            {triggers.map((t: any) => (
              <div key={t.id} className="py-3 flex items-center justify-between">
                <div>
                  <span className={`badge ${t.type === 'click' ? 'badge-green' : 'badge-yellow'} mr-2`}>
                    {t.type}
                  </span>
                  <span className="text-sm text-gray-600">
                    Delay: {t.delay_minutes}min · Max: {t.max_executions}x
                  </span>
                  <p className="text-xs text-gray-400 mt-1 truncate max-w-[400px]">{t.message_template}</p>
                </div>
                <span className={`text-xs ${t.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                  {t.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SMS Confirm Modal */}
      {showSmsConfirm && (
        <Modal title="Send SMS" onClose={() => setShowSmsConfirm(false)}>
          <p className="text-sm text-gray-600 mb-4">
            This will send the campaign SMS to all contacts who haven&apos;t received it yet.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowSmsConfirm(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { sendSms(); setShowSmsConfirm(false); }}
              className="btn-primary"
            >
              Send to All
            </button>
          </div>
        </Modal>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          workspaceId={workspaceId}
          campaignId={campaignId}
          onClose={() => { setShowUpload(false); load(); }}
        />
      )}

      {/* Trigger Form Modal */}
      {showTriggerForm && (
        <TriggerFormModal
          workspaceId={workspaceId}
          campaignId={campaignId}
          onClose={() => { setShowTriggerForm(false); load(); }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function UploadModal({ workspaceId, campaignId, onClose }: { workspaceId: string; campaignId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await api.contacts.upload(workspaceId, campaignId, file);
      setSuccess(`Upload started: ${result.upload.row_count} rows queued for processing`);
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title="Upload CSV" onClose={onClose}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-600 text-sm mb-3">{success}</p>}
      <div className="mb-4">
        <label className="label">CSV File (max 5,000 rows)</label>
        <input
          type="file"
          accept=".csv"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="input"
        />
        <p className="text-xs text-gray-400 mt-2">Required columns: firstname, phone</p>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={upload} disabled={!file || uploading} className="btn-primary">
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </Modal>
  );
}

function TriggerFormModal({ workspaceId, campaignId, onClose }: { workspaceId: string; campaignId: string; onClose: () => void }) {
  const [form, setForm] = useState({
    type: 'click',
    delay_minutes: 0,
    message_template: '',
    max_executions: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.triggers.create(workspaceId, campaignId, form);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create trigger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Trigger Rule" onClose={onClose}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="space-y-4">
        <div>
          <label className="label">Trigger Type</label>
          <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="click">On Click</option>
            <option value="no_click">No Click (after delay)</option>
          </select>
        </div>
        <div>
          <label className="label">Delay (minutes)</label>
          <input
            className="input"
            type="number"
            min="0"
            value={form.delay_minutes}
            onChange={e => setForm({ ...form, delay_minutes: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label">Message Template</label>
          <textarea
            className="input min-h-[80px]"
            value={form.message_template}
            onChange={e => setForm({ ...form, message_template: e.target.value })}
            placeholder="Hi {firstname}, we noticed you..."
          />
        </div>
        <div>
          <label className="label">Max Executions</label>
          <input
            className="input"
            type="number"
            min="1"
            max="10"
            value={form.max_executions}
            onChange={e => setForm({ ...form, max_executions: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={save} disabled={saving || !form.message_template} className="btn-primary">
          {saving ? 'Creating…' : 'Create Trigger'}
        </button>
      </div>
    </Modal>
  );
}
