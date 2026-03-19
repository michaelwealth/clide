'use client';

export const runtime = 'edge';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function WorkspaceIndexPage() {
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
    } else {
      router.replace('/');
    }
  }, [user, workspaces, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse space-y-4 w-full max-w-md px-4">
        <div className="h-8 bg-gray-200 rounded w-32 mx-auto" />
        <div className="h-4 bg-gray-100 rounded w-48 mx-auto" />
      </div>
    </div>
  );
}
