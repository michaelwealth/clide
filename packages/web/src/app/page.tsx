'use client';

export const runtime = 'edge';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function HomePage() {
  const { user, workspaces, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (workspaces.length > 0) {
      router.replace(`/w/${workspaces[0].id}/dashboard`);
    }
  }, [user, workspaces, loading, router]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 animate-pulse">
      <div className="max-w-6xl mx-auto">
        <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-72 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card p-5">
              <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-28" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-4/5" />
          </div>
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
