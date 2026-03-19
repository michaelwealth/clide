'use client';

export const runtime = 'edge';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function DocsPage() {
  const { user, workspaces, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 animate-pulse">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-8 bg-gray-200 rounded w-56" />
          <div className="h-4 bg-gray-100 rounded w-96" />
          <div className="card p-6 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-40" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  const dashboardHref = workspaces.length ? `/w/${workspaces[0].id}/dashboard` : '/';

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-gray-900">CLiDE Documentation</h1>
            <p className="text-sm text-gray-500 mt-1">A practical guide for non-technical and technical users.</p>
          </div>
          <Link href={dashboardHref} className="btn-secondary text-sm">Back to Dashboard</Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Quick Start</h2>
            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2">
              <li>Create or select your workspace.</li>
              <li>Create a campaign and add destination/fallback URLs.</li>
              <li>Upload contacts via CSV and choose duplicate handling mode.</li>
              <li>Send campaign SMS and monitor clicks/delivery.</li>
            </ol>
          </section>

          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Short Links</h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-2">
              <li>Use UTM generator for detailed tracking tags.</li>
              <li>Click a short link in the table to open Visit/Copy/Edit actions.</li>
              <li>Download QR code with the short URL printed under it.</li>
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Campaign Behavior</h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-2">
              <li>Draft/Scheduled campaigns: full edit access.</li>
              <li>Active/Paused campaigns: edit dates and fallback URL.</li>
              <li>Destination URL supports placeholders like {'{firstname}'} and other CSV columns.</li>
            </ul>
          </section>

          <section className="card p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Authentication</h2>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-2">
              <li>Google sign-in is the primary method.</li>
              <li>Password sign-in is available behind a link on login.</li>
              <li>Both methods can map to the same user account email.</li>
            </ul>
          </section>

          <section className="card p-6 lg:col-span-2">
            <h2 className="font-display text-lg font-semibold mb-3">Troubleshooting</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
              <div>
                <p className="font-medium mb-1">Google redirect_uri_mismatch</p>
                <p>Ensure Google redirect URI exactly matches: https://api.cmaf.cc/api/auth/callback.</p>
              </div>
              <div>
                <p className="font-medium mb-1">Password login failed to fetch</p>
                <p>Confirm NEXT_PUBLIC_API_URL is set correctly and API CORS origin matches app domain.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
