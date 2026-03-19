'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, workspaces, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && (!user || !user.is_super_admin)) {
      router.replace('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading || !user?.is_super_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-8 bg-gray-200 rounded w-32 mx-auto" />
          <div className="h-4 bg-gray-100 rounded w-48 mx-auto" />
        </div>
      </div>
    );
  }

  const adminNav = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: DashIcon },
    { label: 'Workspaces', href: '/admin/workspaces', icon: WorkspaceIcon },
    { label: 'Users', href: '/admin/users', icon: UsersIcon },
  ];

  const defaultWs = workspaces.length > 0 ? workspaces[0].id : null;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:inset-auto flex flex-col`}>
        <div className="flex items-center h-14 px-5 border-b border-gray-200 shrink-0">
          <Link href="/" className="font-display text-xl font-bold text-brand-700">CLiDE</Link>
          <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">ADMIN</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {adminNav.map(item => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <item.icon active={isActive} />
                {item.label}
              </Link>
            );
          })}
          <div className="border-t border-gray-100 my-3" />
          {defaultWs && (
            <Link
              href={`/w/${defaultWs}/dashboard`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Workspace
            </Link>
          )}
        </nav>

        <div className="border-t border-gray-200 p-3 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-medium">
                {user.name[0]}
              </div>
            )}
            <span className="text-xs text-gray-600 truncate flex-1">{user.name}</span>
            <button onClick={logout} className="text-gray-400 hover:text-gray-600 p-1" title="Sign out">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 lg:hidden" aria-label="Open menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-2 lg:hidden font-display font-bold text-brand-700">CLiDE</span>
          <div className="flex-1" />
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-white" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold ring-2 ring-white">
                  {user.name[0]}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">{user.name.split(' ')[0]}</span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {profileOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <div className="py-1">
                  {defaultWs && (
                    <Link href={`/w/${defaultWs}/settings`} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setProfileOpen(false)}>
                      Workspace Settings
                    </Link>
                  )}
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button onClick={() => { setProfileOpen(false); logout(); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 px-6 pb-8 pt-8 lg:px-8 lg:pb-8 lg:pt-10 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function DashIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function WorkspaceIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function UsersIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-red-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
