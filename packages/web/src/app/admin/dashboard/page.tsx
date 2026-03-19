'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [wsData, usersData] = await Promise.all([
        api.workspaces.list(),
        api.admin.users.list(),
      ]);
      setStats({
        workspaces: wsData.workspaces?.length ?? 0,
        users: usersData.users?.length ?? 0,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5">
              <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">Total Workspaces</p>
          <p className="font-display text-2xl font-bold text-gray-900">{stats?.workspaces ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">Total Users</p>
          <p className="font-display text-2xl font-bold text-gray-900">{stats?.users ?? 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-gray-500 mb-1">System</p>
          <p className="text-sm text-green-600 font-medium mt-1">Healthy</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/workspaces" className="card p-5 hover:border-brand-200 transition-colors">
          <h2 className="font-display font-semibold text-gray-900 mb-1">Manage Workspaces</h2>
          <p className="text-sm text-gray-500">Create and manage tenant workspaces</p>
        </Link>
        <Link href="/admin/users" className="card p-5 hover:border-brand-200 transition-colors">
          <h2 className="font-display font-semibold text-gray-900 mb-1">Manage Users</h2>
          <p className="text-sm text-gray-500">Invite users and manage access</p>
        </Link>
      </div>
    </div>
  );
}
