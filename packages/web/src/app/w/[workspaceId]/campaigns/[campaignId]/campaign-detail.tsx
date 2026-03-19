'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { CampaignStatusBadge } from '../_components';
import Link from 'next/link';
import { InfoTip, GuideBox } from '@/components/info-tip';

const TRIGGER_LABELS: Record<string, string> = {
  click: 'On Click',
  no_click: 'No Click (after delay)',
  click_delay: 'On Click + Delay',
};

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
  const [editingTrigger, setEditingTrigger] = useState<any>(null);
  const [showDeleteLinksConfirm, setShowDeleteLinksConfirm] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);

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
  const deleteAllLinks = () => performAction('delete-links', () => api.campaigns.deleteLinks(workspaceId, campaignId));
  const killCampaign = () => performAction('kill', () => api.campaigns.kill(workspaceId, campaignId));

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
        <div className="flex flex-wrap gap-2 justify-end">
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
                {actionLoading === 'pause' ? '…' : 'Pause'}
              </button>
              <button
                onClick={() => setShowSmsConfirm(true)}
                className="btn-primary"
                disabled={(stats?.contacts ?? 0) === 0}
                title={(stats?.contacts ?? 0) === 0 ? 'Upload contacts CSV first' : 'Send campaign SMS now'}
              >
                {(stats?.contacts ?? 0) === 0 ? 'Send SMS (No Contacts Yet)' : 'Send SMS'}
              </button>
            </>
          )}
          {campaign.status === 'paused' && (
            <>
              <button
                onClick={() => performAction('activate', () => api.campaigns.activate(workspaceId, campaignId))}
                disabled={!!actionLoading}
                className="btn-primary"
              >
                {actionLoading === 'activate' ? '…' : 'Resume'}
              </button>
              <button
                onClick={() => setShowSmsConfirm(true)}
                className="btn-secondary"
                disabled={true}
                title="Resume campaign to send SMS"
              >
                Send SMS
              </button>
            </>
          )}
          {!['active', 'paused'].includes(campaign.status) && (
            <button
              disabled
              className="btn-secondary"
              title="Activate campaign and upload contacts to send SMS"
            >
              Send SMS
            </button>
          )}
          {campaign.status !== 'expired' && (
            <button
              onClick={() => setShowKillConfirm(true)}
              disabled={!!actionLoading}
              className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
              title="Permanently expire this campaign and delete all short links. Cannot be undone."
            >
              Kill
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      <p className="text-xs text-gray-500 mb-6">
        SMS is sent only when campaign is <strong>Active</strong> and contacts are uploaded. CSV upload does not auto-send SMS.
      </p>

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
              <dt className="text-gray-500">Shortlink Generation</dt>
              <dd className="text-gray-900">{campaign.disable_shortlink_generation ? 'Disabled' : 'Enabled'}</dd>
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
      <div className="flex flex-wrap gap-3 mb-8">
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
        {stats?.links > 0 && (
          <button
            onClick={() => setShowDeleteLinksConfirm(true)}
            className="btn-secondary text-red-600 border-red-200 hover:bg-red-50"
            title="Delete all contact short links for this campaign. Contacts are kept."
          >
            Delete All Links ({stats.links})
          </button>
        )}
      </div>

      {/* Triggers */}
      {triggers.length > 0 && (
        <div className="card p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold">Trigger Rules</h2>
            <button onClick={() => setShowTriggerForm(true)} className="btn-secondary text-xs py-1.5 px-3">
              + Add Trigger
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {triggers.map((t: any) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`badge ${t.type === 'click' ? 'badge-green' : t.type === 'click_delay' ? 'badge-blue' : 'badge-yellow'}`}>
                      {TRIGGER_LABELS[t.type] ?? t.type}
                    </span>
                    {t.type !== 'click' && (
                      <span className="text-xs text-gray-500">Delay: {t.delay_minutes} min</span>
                    )}
                    <span className="text-xs text-gray-500">Max: {t.max_executions}×</span>
                    <span className={`text-xs font-medium ${t.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {t.is_active ? '● Active' : '○ Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate max-w-[400px]">{t.message_template}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingTrigger(t)}
                    className="text-xs text-brand-600 hover:text-brand-800 cursor-pointer px-2 py-1 rounded hover:bg-brand-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => performAction(`del-trigger-${t.id}`, () => api.triggers.delete(workspaceId, campaignId, t.id))}
                    disabled={!!actionLoading}
                    className="text-xs text-red-500 hover:text-red-700 cursor-pointer px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
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

      {/* Edit Trigger Modal */}
      {editingTrigger && (
        <TriggerEditModal
          workspaceId={workspaceId}
          campaignId={campaignId}
          trigger={editingTrigger}
          onClose={() => { setEditingTrigger(null); load(); }}
        />
      )}

      {/* Kill Campaign Confirm */}
      {showKillConfirm && (
        <Modal title="Kill Campaign?" onClose={() => setShowKillConfirm(false)}>
          <p className="text-sm text-gray-600 mb-2">
            This will <strong>permanently expire</strong> this campaign and delete all <strong>{stats?.links ?? 0}</strong> short links.
          </p>
          <p className="text-sm text-red-600 mb-4">
            Short links will stop working immediately. This cannot be undone — the campaign can never be re-activated.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowKillConfirm(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { killCampaign(); setShowKillConfirm(false); }}
              disabled={!!actionLoading}
              className="btn-danger"
            >
              {actionLoading === 'kill' ? 'Killing…' : 'Kill Campaign'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete All Links Confirm */}
      {showDeleteLinksConfirm && (
        <Modal title="Delete All Campaign Links?" onClose={() => setShowDeleteLinksConfirm(false)}>
          <p className="text-sm text-gray-600 mb-4">
            This will permanently delete all <strong>{stats?.links}</strong> short links for this campaign, removing them from KV so they no longer redirect.
            Contacts are kept. You can re-import a CSV to regenerate links.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteLinksConfirm(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={() => { deleteAllLinks(); setShowDeleteLinksConfirm(false); }}
              disabled={!!actionLoading}
              className="btn-danger"
            >
              {actionLoading === 'delete-links' ? 'Deleting…' : 'Delete All Links'}
            </button>
          </div>
        </Modal>
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
        Triggers send automated follow-up SMS based on click behavior.
        <ul className="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>On Click</strong> — SMS sent immediately when a contact clicks their link.</li>
          <li><strong>On Click + Delay</strong> — SMS sent after a delay once they click.</li>
          <li><strong>No Click (after delay)</strong> — SMS sent after the delay if they haven&apos;t clicked.</li>
        </ul>
      </GuideBox>
      <div className="space-y-4 mt-4">
        <div>
          <label className="label">
            Trigger Type
          </label>
          <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="click">On Click (immediate)</option>
            <option value="click_delay">On Click + Delay</option>
            <option value="no_click">No Click (after delay)</option>
          </select>
        </div>
        {form.type !== 'click' && (
          <div>
            <label className="label">Delay (minutes)</label>
            <input
              className="input"
              type="number"
              min={form.type === 'click_delay' ? 1 : 0}
              value={form.delay_minutes}
              onChange={e => setForm({ ...form, delay_minutes: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.type === 'click_delay' ? 'Time after click to send the message.' : 'Wait this long after contact upload before sending if they haven\'t clicked.'}
            </p>
          </div>
        )}
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
          <label className="label">Max Executions <InfoTip text="How many times this trigger can fire for a single contact" /></label>
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

function TriggerEditModal({ workspaceId, campaignId, trigger, onClose }: {
  workspaceId: string;
  campaignId: string;
  trigger: any;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    delay_minutes: trigger.delay_minutes ?? 0,
    message_template: trigger.message_template ?? '',
    max_executions: trigger.max_executions ?? 1,
    is_active: trigger.is_active === 1 || trigger.is_active === true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.triggers.update(workspaceId, campaignId, trigger.id, form);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update trigger');
    } finally {
      setSaving(false);
    }
  };

  const showDelay = trigger.type !== 'click';

  return (
    <Modal title={`Edit Trigger — ${TRIGGER_LABELS[trigger.type] ?? trigger.type}`} onClose={onClose}>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <div className="space-y-4">
        {showDelay && (
          <div>
            <label className="label">Delay (minutes)</label>
            <input
              className="input"
              type="number"
              min={trigger.type === 'click_delay' ? 1 : 0}
              value={form.delay_minutes}
              onChange={e => setForm({ ...form, delay_minutes: parseInt(e.target.value) || 0 })}
            />
          </div>
        )}
        <div>
          <label className="label">Message Template</label>
          <textarea
            className="input min-h-[80px]"
            value={form.message_template}
            onChange={e => setForm({ ...form, message_template: e.target.value })}
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
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={save} disabled={saving || !form.message_template} className="btn-primary">
          {saving ? 'Saving…' : 'Save Changes'}
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
    disable_shortlink_generation: !!campaign.disable_shortlink_generation,
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
        payload.disable_shortlink_generation = form.disable_shortlink_generation;
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
        <div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.disable_shortlink_generation}
              disabled={isLimited}
              onChange={e => setForm({ ...form, disable_shortlink_generation: e.target.checked })}
            />
            Disable shortlink generation
          </label>
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
