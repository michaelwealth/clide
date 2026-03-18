'use client';

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
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-gray-400">Loading…</div>
    </div>
  );
}
