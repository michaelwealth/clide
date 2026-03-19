'use client';


import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface Stats {
  campaigns: Array<{ status: string; count: number }>;
  total_contacts: number;
  sms: Array<{ status: string; count: number }>;
  total_clicks: number;
}

export default function DashboardContent() {
  const { workspaceId } = useParams() as { workspaceId: string };
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.analytics.workspace(workspaceId)
      .then(setStats)
      .catch((err) => setError(err.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
    );
  }

  const campaignsByStatus = Object.fromEntries(
    (stats?.campaigns || []).map(c => [c.status, c.count])
  );
  const smsByStatus = Object.fromEntries(
    (stats?.sms || []).map(s => [s.status, s.count])
  );
  const totalCampaigns = Object.values(campaignsByStatus).reduce((a, b) => a + b, 0);
  const totalSms = Object.values(smsByStatus).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your workspace activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Campaigns" value={totalCampaigns} detail={`${campaignsByStatus['active'] || 0} active`} />
        <StatCard title="Total Contacts" value={stats?.total_contacts ?? 0} />
        <StatCard title="SMS Sent" value={totalSms} detail={`${smsByStatus['delivered'] || 0} delivered`} />
        <StatCard title="Total Clicks" value={stats?.total_clicks ?? 0} />
      </div>

      {/* Campaign Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">Campaign Status</h2>
          <div className="space-y-3">
            {['draft', 'scheduled', 'active', 'paused', 'expired'].map(status => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{status}</span>
                <span className="text-sm font-medium">{campaignsByStatus[status] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold mb-4">SMS Delivery</h2>
          <div className="space-y-3">
            {['pending', 'queued', 'sent', 'delivered', 'failed'].map(status => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{status}</span>
                <span className="text-sm font-medium">{smsByStatus[status] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <Link href={`/w/${workspaceId}/campaigns`} className="btn-primary">
          View Campaigns →
        </Link>
      </div>
    </div>
  );
}

function StatCard({ title, value, detail }: { title: string; value: number; detail?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className="font-display text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
      <div className="h-4 bg-gray-100 rounded w-72 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card p-5">
            <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
