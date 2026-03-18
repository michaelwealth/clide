'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !user.is_super_admin)) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || !user?.is_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
          <Link href="/" className="font-display font-bold text-lg text-brand-600">CLiDE</Link>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">ADMIN</span>
          <div className="flex gap-4 ml-4">
            <Link href="/admin/workspaces" className="text-sm text-gray-600 hover:text-gray-900">Workspaces</Link>
            <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
          </div>
          <div className="ml-auto">
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-600">← Back to App</Link>
          </div>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
