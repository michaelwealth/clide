'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { CampaignStatusBadge } from '../_components';
import Link from 'next/link';
import { InfoTip, GuideBox } from '@/components/info-tip';

export default function CampaignDetailClient() {
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
  const [showEdit, setShowEdit] = useState(false);

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
        <div className="h-4 bg-gray-100 rounded w-32 mb-4" />
        <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-48 mb-8" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-4">
              <div className="h-3 bg-gray-100 rounded w-16 mb-2" />
              <div className="h-6 bg-gray-200 rounded w-12" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-16 bg-gray-100 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return <div className="text-red-600">{error || 'Campaign not found'}</div>;
  }

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
            <CampaignStatusBadge status={campaign.status} className="text-sm" />
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
          <p className="text-xs text-gray-500 uppercase tracking-wide">Contacts <InfoTip text="Total people uploaded via CSV for this campaign" /></p>
          <p className="font-display text-xl font-bold mt-1">{stats?.contacts ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Links <InfoTip text="Unique short links generated — one per contact" /></p>
          <p className="font-display text-xl font-bold mt-1">{stats?.links ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Clicks <InfoTip text="Total clicks across all short links in this campaign" /></p>
          <p className="font-display text-xl font-bold mt-1">{stats?.clicks ?? 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">SMS Sent <InfoTip text="Total SMS messages queued or sent for this campaign" /></p>
          <p className="font-display text-xl font-bold mt-1">{stats?.sms_sent ?? 0}</p>
        </div>
      </div>

      {/* Campaign Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Details</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500 mb-0.5">Destination URL <InfoTip text="The URL each contact's short link redirects to. If it contains {placeholders}, they will be replaced with each contact's CSV data." /></dt>
              <dd className="text-gray-900 break-all text-xs font-mono bg-gray-50 p-2 rounded">{campaign.base_url}</dd>
              {/\{\w+\}/.test(campaign.base_url || '') && (
                <p className="text-xs text-brand-600 mt-1">
                  Personalized: {(campaign.base_url.match(/\{(\w+)\}/g) || []).join(', ')}
                </p>
              )}
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Fallback URL <InfoTip text="Where links redirect when the campaign is expired or paused" /></dt>
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
        <button onClick={() => setShowEdit(true)} className="btn-secondary">
          Edit Campaign
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

      {/* Edit Campaign Modal */}
      {showEdit && (
        <EditCampaignModal
          workspaceId={workspaceId}
          campaignId={campaignId}
          campaign={campaign}
          onClose={() => { setShowEdit(false); load(); }}
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="card w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="font-display text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function UploadModal({ workspaceId, campaignId, onClose }: { workspaceId: string; campaignId: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'keep' | 'replace'>('keep');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState<string[]>([]);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setPreview([]);
    if (f) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split('\n')[0];
        if (firstLine) {
          setPreview(firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, '')));
        }
      };
      reader.readAsText(f.slice(0, 2048));
    }
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await api.contacts.upload(workspaceId, campaignId, file, undefined, duplicateMode);
      setSuccess(`Upload started: ${result.upload.row_count} rows queued for processing`);
      setTimeout(onClose, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal title="Upload Contacts CSV" onClose={onClose}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {success && <p className="text-green-600 text-sm mb-3">{success}</p>}

      <GuideBox>
        <p className="font-medium mb-1">CSV Requirements</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li><strong>Required columns:</strong> firstname (or name), phone (or mobile)</li>
          <li><strong>Optional columns:</strong> email, city, or any custom fields</li>
          <li>Max 5,000 rows per upload</li>
          <li>Phone numbers will be auto-formatted to international format (234...)</li>
        </ul>
        <p className="mt-2 font-medium">URL Personalization</p>
        <p>If your Destination URL contains <code className="bg-brand-100 px-1 rounded">{'{column_name}'}</code> placeholders, they will be replaced with each contact&apos;s data from the matching CSV column.</p>
        <p className="mt-1 text-[10px] text-brand-600">
          Example: URL <code>https://example.com?name={'{fname}'}&city={'{city}'}</code> + CSV columns &quot;fname&quot; and &quot;city&quot; → each contact gets a personalized destination.
        </p>
      </GuideBox>

      <div className="mt-4 mb-4">
        <label className="label">CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={e => handleFileChange(e.target.files?.[0] || null)}
          className="input"
        />
      </div>

      <div className="mb-4">
        <label className="label">If a contact phone already exists</label>
        <select
          className="input"
          value={duplicateMode}
          onChange={(e) => setDuplicateMode(e.target.value as 'keep' | 'replace')}
        >
          <option value="keep">Keep existing contact data (skip duplicate rows)</option>
          <option value="replace">Replace existing contact data with CSV values</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          New contacts are always imported. This setting only affects rows with phone numbers already in this campaign.
        </p>
      </div>

      {preview.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-1">Detected columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.map(h => (
              <span key={h} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700 font-mono">
                {h}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            Use these column names as {'{placeholders}'} in your Destination URL and SMS Template.
          </p>
        </div>
      )}

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
      <GuideBox>
        Triggers send automated follow-up SMS to contacts based on their click behavior. <strong>On Click</strong> fires when a contact clicks their link. <strong>No Click</strong> fires after a delay if they haven&apos;t clicked.
      </GuideBox>
      <div className="space-y-4 mt-4">
        <div>
          <label className="label">
            Trigger Type
            <InfoTip text="'On Click' sends an SMS immediately when a contact clicks their link. 'No Click' sends after the specified delay if the contact hasn't clicked." />
          </label>
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

function EditCampaignModal({ workspaceId, campaignId, campaign, onClose }: {
  workspaceId: string;
  campaignId: string;
  campaign: any;
  onClose: () => void;
}) {
  const isLimited = ['active', 'paused'].includes(campaign.status);
  const [form, setForm] = useState({
    name: campaign.name || '',
    base_url: campaign.base_url || '',
    fallback_url: campaign.fallback_url || '',
    sms_template: campaign.sms_template || '',
    start_at: campaign.start_at ? campaign.start_at.slice(0, 16) : '',
    end_at: campaign.end_at ? campaign.end_at.slice(0, 16) : '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: any = {
        fallback_url: form.fallback_url,
        start_at: form.start_at || null,
        end_at: form.end_at || null,
      };
      if (!isLimited) {
        payload.name = form.name;
        payload.base_url = form.base_url;
        payload.sms_template = form.sms_template;
      }
      await api.campaigns.update(workspaceId, campaignId, payload);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Campaign" onClose={onClose}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {isLimited && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          This campaign is {campaign.status}. Only dates and fallback URL can be edited.
        </p>
      )}
      <div className="space-y-4">
        <div>
          <label className="label">Campaign Name</label>
          <input className="input" value={form.name} disabled={isLimited}
            onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Destination URL</label>
          <input className="input" type="url" value={form.base_url} disabled={isLimited}
            onChange={e => setForm({ ...form, base_url: e.target.value })} />
        </div>
        <div>
          <label className="label">Fallback URL</label>
          <input className="input" type="url" value={form.fallback_url}
            onChange={e => setForm({ ...form, fallback_url: e.target.value })} />
        </div>
        <div>
          <label className="label">SMS Template</label>
          <textarea className="input min-h-[60px]" value={form.sms_template} disabled={isLimited}
            onChange={e => setForm({ ...form, sms_template: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input className="input" type="datetime-local" value={form.start_at}
              onChange={e => setForm({ ...form, start_at: e.target.value })} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input className="input" type="datetime-local" value={form.end_at}
              onChange={e => setForm({ ...form, end_at: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
