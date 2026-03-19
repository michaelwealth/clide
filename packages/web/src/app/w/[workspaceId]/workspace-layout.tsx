'use client';

import { useAuth } from '@/lib/auth';
import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ReactNode, useEffect, useState, useRef } from 'react';
import { InfoTip } from '@/components/info-tip';

const WORKSPACE_COLORS = [
  'bg-amber-500', 'bg-teal-500', 'bg-rose-500', 'bg-indigo-500',
  'bg-emerald-500', 'bg-violet-500', 'bg-sky-500', 'bg-orange-500',
];

function getWorkspaceColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return WORKSPACE_COLORS[Math.abs(hash) % WORKSPACE_COLORS.length];
}

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon, tip: 'Overview of workspace stats, campaigns, and SMS delivery' },
  { label: 'Campaigns', href: '/campaigns', icon: CampaignsIcon, tip: 'Create and manage link campaigns with SMS dispatch' },
  { label: 'Links', href: '/links', icon: LinksIcon, tip: 'Create and manage standalone short links' },
  { label: 'Docs', href: '/docs', icon: DocsIcon, tip: 'Help guides and platform documentation', absolute: true },
  { label: 'Settings', href: '/settings', icon: SettingsIcon, tip: 'Configure workspace name, members, and SMS providers' },
];

export default function WorkspaceLayoutClient({ children }: { children: ReactNode }) {
  const { user, workspaces, loading, logout } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const workspaceId = params.workspaceId as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse space-y-4 w-full max-w-md px-4">
          <div className="h-8 bg-gray-200 rounded w-32 mx-auto" />
          <div className="h-4 bg-gray-100 rounded w-48 mx-auto" />
          <div className="grid grid-cols-2 gap-3 mt-8">
            <div className="h-24 bg-gray-100 rounded-xl" />
            <div className="h-24 bg-gray-100 rounded-xl" />
            <div className="h-24 bg-gray-100 rounded-xl" />
            <div className="h-24 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const currentWorkspace = workspaces.find(w => w.id === workspaceId);
  const otherWorkspaces = workspaces.filter(w => w.id !== workspaceId);
  const basePath = `/w/${workspaceId}`;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ─── Sidebar ─── */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:static lg:inset-auto flex flex-col`}>

        {/* Logo */}
        <div className="flex items-center h-14 px-5 border-b border-gray-200 shrink-0">
          <Link href="/" className="font-display text-xl font-bold text-brand-700">CLiDE</Link>
        </div>

        {/* Workspace Switcher */}
        <div className="px-3 py-3 border-b border-gray-100 shrink-0" ref={switcherRef}>
          <button
            onClick={() => setSwitcherOpen(!switcherOpen)}
            className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <div className={`w-8 h-8 rounded-lg ${getWorkspaceColor(workspaceId)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
              {(currentWorkspace?.name || 'W')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{currentWorkspace?.name || 'Workspace'}</p>
              <p className="text-[10px] text-gray-400">{currentWorkspace?.role || 'member'}</p>
            </div>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Switcher Dropdown */}
          {switcherOpen && (
            <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 animate-in">
              {/* Current workspace header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${getWorkspaceColor(workspaceId)} flex items-center justify-center text-white font-bold`}>
                    {(currentWorkspace?.name || 'W')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{currentWorkspace?.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{currentWorkspace?.role} · Current</p>
                  </div>
                </div>
              </div>

              {/* Other workspaces */}
              {otherWorkspaces.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1 mb-1">Switch Workspace</p>
                  {otherWorkspaces.map(w => (
                    <a
                      key={w.id}
                      href={`/w/${w.id}/dashboard`}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                      onClick={() => setSwitcherOpen(false)}
                    >
                      <div className={`w-7 h-7 rounded-lg ${getWorkspaceColor(w.id)} flex items-center justify-center text-white text-xs font-bold`}>
                        {w.name[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-gray-700">{w.name}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Create workspace */}
              {user.is_super_admin && (
                <div className="px-3 py-2 border-t border-gray-100">
                  <Link
                    href="/admin/workspaces"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm text-brand-600 font-medium rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors"
                    onClick={() => setSwitcherOpen(false)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Workspace
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const href = item.absolute ? item.href : `${basePath}${item.href}`;
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={item.href}
                href={href}
                title={item.tip}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <item.icon active={isActive} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar bottom: user — sticky */}
        <div className="border-t border-gray-200 p-3 shrink-0 bg-white">
          <div className="flex items-center gap-2">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-medium">
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

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ─── Main Area ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 shrink-0">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 lg:hidden" aria-label="Open menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-2 lg:hidden font-display font-bold text-brand-700">CLiDE</span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Top-right: profile menu (ClickUp-style) */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-white" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold ring-2 ring-white">
                  {user.name[0]}
                </div>
              )}
              <span className="text-sm font-medium text-gray-700 hidden sm:inline">{user.name.split(' ')[0]}</span>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 animate-in">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                        {user.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    </div>
                  </div>
                  {currentWorkspace && (
                    <p className="mt-2 text-[10px] text-gray-400 uppercase tracking-wider">
                      {currentWorkspace.name} · <span className="capitalize">{currentWorkspace.role}</span>
                    </p>
                  )}
                </div>
                <div className="py-1">
                  <Link
                    href={`${basePath}/settings`}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setProfileOpen(false)}
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Workspace Settings
                  </Link>
                  {user.is_super_admin && (
                    <Link
                      href="/admin/users"
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setProfileOpen(false)}
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Admin Panel
                    </Link>
                  )}
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button
                    onClick={() => { setProfileOpen(false); logout(); }}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-6 pb-8 pt-8 lg:px-8 lg:pb-8 lg:pt-10 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Icons ──
function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function CampaignsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LinksIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.74a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" />
    </svg>
  );
}

function DocsIcon({ active }: { active: boolean }) {
  return (
    <svg className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.483 9.246 5 7.5 5 4.739 5 2.5 6.567 2.5 8.5v10c0-1.933 2.239-3.5 5-3.5 1.746 0 3.332.483 4.5 1.253m0-10C13.168 5.483 14.754 5 16.5 5c2.761 0 5 1.567 5 3.5v10c0-1.933-2.239-3.5-5-3.5-1.746 0-3.332.483-4.5 1.253" />
    </svg>
  );
}
