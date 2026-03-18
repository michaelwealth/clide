'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SettingsPage() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'sms'>('general');

  const load = useCallback(async () => {
    try {
      const [wsData, membersData] = await Promise.all([
        api.workspaces.get(workspaceId),
        api.workspaces.members.list(workspaceId),
      ]);
      setWorkspace(wsData.workspace);
      setEditName(wsData.workspace.name);
      setMembers(membersData.members);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const updateName = async () => {
    if (!editName.trim() || editName === workspace?.name) return;
    setSaving(true);
    setError('');
    try {
      await api.workspaces.update(workspaceId, { name: editName.trim() });
      setSuccess('Workspace name updated');
      await load();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const updateRole = async (memberId: string, role: string) => {
    setError('');
    try {
      await api.workspaces.members.update(workspaceId, memberId, { role });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update role');
    }
  };

  const removeMember = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    setError('');
    try {
      await api.workspaces.members.remove(workspaceId, memberId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove member');
    }
  };

  // Determine current user's role
  const currentMember = members.find((m: any) => m.user_id === user?.id);
  const canManage = currentMember && ['owner', 'admin'].includes(currentMember.role);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'general' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'sms' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          SMS Providers
        </button>
      </div>

      {activeTab === 'general' && (
        <>
          {/* Workspace Info */}
      <div className="card p-6 mb-6">
        <h2 className="font-display text-lg font-semibold mb-4">Workspace</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                disabled={!canManage}
              />
              {canManage && (
                <button
                  onClick={updateName}
                  disabled={saving || editName === workspace?.name}
                  className="btn-primary"
                >
                  {saving ? '…' : 'Save'}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="label">Workspace ID</label>
            <p className="text-sm text-gray-500 font-mono">{workspaceId}</p>
          </div>
          <div>
            <label className="label">Slug</label>
            <p className="text-sm text-gray-500">{workspace?.slug}</p>
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Members</h2>
          {canManage && (
            <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
              + Add Member
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {members.map((m: any) => (
            <div key={m.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{m.name || m.email}</p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-3">
                {canManage && m.user_id !== user?.id ? (
                  <>
                    <select
                      className="input text-sm py-1 w-28"
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value)}
                    >
                      <option value="admin">Admin</option>
                      <option value="operator">Operator</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => removeMember(m.id, m.name || m.email)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="badge badge-blue text-xs">{m.role}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal
          workspaceId={workspaceId}
          onClose={() => { setShowInvite(false); load(); }}
        />
      )}

        </>
      )}

      {activeTab === 'sms' && (
        <SmsConfigSection workspaceId={workspaceId} canManage={!!canManage} />
      )}
    </div>
  );
}

function InviteModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.workspaces.members.add(workspaceId, { email, role });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-md mx-4 p-6">
        <h2 className="font-display text-lg font-semibold mb-4">Add Member</h2>
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
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SMS_PROVIDERS = [
  { key: 'kudi', label: 'Kudi SMS', fields: ['kudi_api_key', 'kudi_sender_id'] },
  { key: 'termii', label: 'Termii', fields: ['termii_api_key', 'termii_sender_id'] },
  { key: 'africastalking', label: "Africa's Talking", fields: ['at_api_key', 'at_username', 'at_sender_id'] },
];

function SmsConfigSection({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api.workspaces.smsConfig.get(workspaceId)
      .then((data) => setConfig(data.config))
      .catch((err) => setError(err.message || 'Failed to load SMS config'))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.workspaces.smsConfig.update(workspaceId, config);
      setSuccess('SMS configuration saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded" />;
  }

  return (
    <div className="space-y-6">
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

      {/* Provider Priority */}
      <div className="card p-6">
        <h2 className="font-display text-lg font-semibold mb-2">Provider Priority</h2>
        <p className="text-xs text-gray-500 mb-3">
          Order in which providers are tried. Failover occurs automatically on send failure.
        </p>
        <input
          className="input"
          value={config?.provider_priority || ''}
          onChange={(e) => setConfig({ ...config, provider_priority: e.target.value })}
          disabled={!canManage}
          placeholder="kudi,termii,africastalking"
        />
      </div>

      {/* Per-provider config */}
      {SMS_PROVIDERS.map(({ key, label, fields }) => (
        <div key={key} className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">{label}</h2>
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field}>
                <label className="label">{fieldLabel(field)}</label>
                <input
                  className="input"
                  type={field.includes('api_key') ? 'password' : 'text'}
                  value={config?.[field] || ''}
                  onChange={(e) => setConfig({ ...config, [field]: e.target.value })}
                  disabled={!canManage}
                  placeholder={field.includes('api_key') ? 'Enter API key (leave blank to keep current)' : ''}
                />
                {field.includes('api_key') && (
                  <p className="text-xs text-gray-400 mt-1">
                    Stored encrypted server-side. Masked values shown for security.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {canManage && (
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save SMS Configuration'}
        </button>
      )}
    </div>
  );
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    kudi_api_key: 'API Key',
    kudi_sender_id: 'Sender ID',
    termii_api_key: 'API Key',
    termii_sender_id: 'Sender ID',
    at_api_key: 'API Key',
    at_username: 'Username',
    at_sender_id: 'Sender ID',
  };
  return labels[field] || field;
}
