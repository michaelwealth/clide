'use client';

export const runtime = 'edge';

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const sections = [
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'workspaces', label: 'Workspaces' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'csv-upload', label: 'CSV Upload & Contacts' },
  { id: 'short-links', label: 'Short Links' },
  { id: 'sms', label: 'SMS Dispatch' },
  { id: 'personalization', label: 'Personalization' },
  { id: 'triggers', label: 'Triggers & Automation' },
  { id: 'analytics', label: 'Analytics & Tracking' },
  { id: 'settings', label: 'Settings & SMS Config' },
  { id: 'auth', label: 'Authentication' },
  { id: 'admin', label: 'Admin Panel' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'faq', label: 'FAQ' },
];

export default function DocsPage() {
  const { user, workspaces, loading } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('quick-start');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    const headings = contentRef.current?.querySelectorAll('[data-section]');
    headings?.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, [loading, user]);

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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-gray-200 bg-white sticky top-0 h-screen overflow-y-auto">
        <div className="px-5 py-5 border-b border-gray-200">
          <Link href={dashboardHref} className="font-display text-lg font-bold text-brand-700">CLiDE</Link>
          <p className="text-xs text-gray-400 mt-0.5">Documentation</p>
        </div>
        <nav className="px-3 py-4 space-y-0.5">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`block w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                activeSection === s.id
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-gray-100">
          <Link href={dashboardHref} className="btn-secondary text-xs w-full text-center block">
            Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Content */}
      <div ref={contentRef} className="flex-1 py-8 px-6 lg:px-12 max-w-4xl mx-auto">
        {/* Mobile header */}
        <div className="flex items-center justify-between mb-8 lg:hidden">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">CLiDE Documentation</h1>
            <p className="text-sm text-gray-500 mt-1">Complete user guide</p>
          </div>
          <Link href={dashboardHref} className="btn-secondary text-sm">Dashboard</Link>
        </div>

        <div className="hidden lg:block mb-8">
          <h1 className="font-display text-3xl font-bold text-gray-900">CLiDE Documentation</h1>
          <p className="text-sm text-gray-500 mt-1">Commercium Link &amp; Dispatch Engine — Complete user guide for the platform.</p>
        </div>

        {/* ─── Quick Start ─── */}
        <Section id="quick-start" title="Quick Start">
          <p>Get up and running with CLiDE in four steps:</p>
          <ol className="list-decimal list-inside space-y-2 mt-3">
            <li><strong>Create or select a workspace</strong> — Workspaces let you organize campaigns and team members. Each workspace has its own contacts, links, and SMS configuration.</li>
            <li><strong>Create a campaign</strong> — Set up a Destination URL (the page each short link redirects to), a Fallback URL (where links go when the campaign is paused/expired), and optionally an SMS Template.</li>
            <li><strong>Upload contacts via CSV</strong> — Upload a CSV file with at least <code>firstname</code> and <code>phone</code> columns. The system auto-generates a unique short link per contact.</li>
            <li><strong>Activate &amp; send SMS</strong> — Move the campaign to Active status, then click &ldquo;Send SMS.&rdquo; Messages are queued and dispatched in the background with automatic retries.</li>
          </ol>
        </Section>

        {/* ─── Workspaces ─── */}
        <Section id="workspaces" title="Workspaces">
          <p>Workspaces provide multi-tenant isolation. Each workspace has its own:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li>Campaigns, contacts, and short links</li>
            <li>Team members with role-based access (Owner, Admin, Operator, Viewer)</li>
            <li>SMS provider configuration (per-workspace API keys)</li>
          </ul>
          <H3>Roles</H3>
          <table className="w-full text-sm mt-2 border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Permissions</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2 font-medium">Owner</td><td className="px-3 py-2">Full access. Manage members, delete workspace.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Admin</td><td className="px-3 py-2">Manage members, send SMS, manage campaigns.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Operator</td><td className="px-3 py-2">Create/edit campaigns, upload contacts, create triggers.</td></tr>
              <tr><td className="px-3 py-2 font-medium">Viewer</td><td className="px-3 py-2">Read-only access to campaigns, contacts, and analytics.</td></tr>
            </tbody>
          </table>
        </Section>

        {/* ─── Campaigns ─── */}
        <Section id="campaigns" title="Campaigns">
          <p>A campaign groups contacts, short links, and SMS messages together. Each campaign has a unique two-character <strong>campaign key</strong> that prefixes all its short link URLs.</p>
          <H3>Campaign Lifecycle</H3>
          <div className="bg-gray-50 p-4 rounded-lg mt-2 font-mono text-xs text-gray-700">
            Draft → Scheduled → Active ↔ Paused → Expired
          </div>
          <ul className="list-disc list-inside space-y-1 mt-3">
            <li><strong>Draft:</strong> Full edit access. Configure URLs, SMS template, upload contacts.</li>
            <li><strong>Scheduled:</strong> Waiting for start date. Can still fully edit or revert to Draft.</li>
            <li><strong>Active:</strong> Links redirect to Destination URL. SMS can be dispatched. Only dates and fallback URL editable.</li>
            <li><strong>Paused:</strong> Links redirect to Fallback URL. Can resume to Active.</li>
            <li><strong>Expired:</strong> Links redirect to Fallback URL. Read-only.</li>
          </ul>
          <H3>Campaign Fields</H3>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Destination URL:</strong> Where short links redirect. Supports <code>{'{column_name}'}</code> placeholders from CSV data for personalized URLs per contact.</li>
            <li><strong>Fallback URL:</strong> Where links redirect when campaign is paused or expired.</li>
            <li><strong>SMS Template:</strong> Message text for campaign SMS. Supports <code>{'{firstname}'}</code>, <code>{'{link}'}</code>, and any CSV column as placeholders.</li>
            <li><strong>Start/End Date:</strong> Optional schedule. Campaigns auto-transition between scheduled, active, and expired based on these dates.</li>
          </ul>
        </Section>

        {/* ─── CSV Upload ─── */}
        <Section id="csv-upload" title="CSV Upload & Contacts">
          <p>Upload contacts to a campaign via CSV. The system processes the file in the background, creating a contact record and unique short link for each row.</p>
          <H3>Required Columns</H3>
          <p className="mt-1">The CSV must contain at minimum:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><code>firstname</code> (or <code>first_name</code>, <code>name</code>)</li>
            <li><code>phone</code> (or <code>phone_number</code>, <code>mobile</code>, <code>telephone</code>)</li>
          </ul>
          <H3>Optional Columns</H3>
          <p className="mt-1">Any additional columns (e.g. <code>email</code>, <code>city</code>, <code>ticket_code</code>) are stored as extra data and available as URL/SMS placeholders.</p>
          <H3>Duplicate Handling</H3>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Keep:</strong> If a contact with the same phone number already exists in the campaign, the duplicate row is skipped.</li>
            <li><strong>Replace:</strong> The existing contact&rsquo;s data is updated with the new CSV values.</li>
          </ul>
          <H3>Phone Number Formatting</H3>
          <p className="mt-1">Phone numbers are automatically normalized to international format (e.g. <code>08012345678</code> → <code>2348012345678</code>). Invalid numbers are skipped.</p>
          <H3>Limits</H3>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>Max 5,000 rows per upload</li>
            <li>Max 5MB file size</li>
            <li>CSV format only (.csv)</li>
          </ul>
        </Section>

        {/* ─── Short Links ─── */}
        <Section id="short-links" title="Short Links">
          <p>CLiDE supports two types of short links:</p>
          <H3>1. Campaign Links (Auto-generated)</H3>
          <p className="mt-1">Created automatically when you upload contacts to a campaign. Each contact gets a unique link like <code>s.cmaf.cc/AB/john-smith</code> where <code>AB</code> is the campaign key and <code>john-smith</code> is an auto-generated slug from the contact&rsquo;s name.</p>
          <H3>2. Standalone Links (Manual)</H3>
          <p className="mt-1">Created from the &ldquo;Links&rdquo; page. These are independent of campaigns — useful for social media posts, email signatures, or any one-off URL shortening.</p>
          <H3>Features</H3>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>UTM Generator:</strong> Built-in UTM parameter builder for source, medium, campaign, term, and content tracking.</li>
            <li><strong>QR Codes:</strong> Click the QR icon on any link to view and download a branded QR code image.</li>
            <li><strong>Click tracking:</strong> Every click is logged with timestamp, user agent, and IP (hashed).</li>
            <li><strong>Active/Inactive toggle:</strong> Disable a link without deleting it.</li>
            <li><strong>Custom slugs:</strong> Optionally set a custom slug like <code>s.cmaf.cc/my-promo</code>.</li>
          </ul>
        </Section>

        {/* ─── SMS Dispatch ─── */}
        <Section id="sms" title="SMS Dispatch">
          <p>Send SMS messages to campaign contacts. SMS dispatch is only available when a campaign is in <strong>Active</strong> status and has an SMS template configured.</p>
          <H3>How It Works</H3>
          <ol className="list-decimal list-inside space-y-1 mt-2">
            <li>Configure an SMS template on the campaign (e.g., <code>Hi {'{firstname}'}, check this out: {'{link}'}</code>).</li>
            <li>Activate the campaign.</li>
            <li>Click &ldquo;Send SMS&rdquo; — sends to all contacts who haven&rsquo;t yet received the campaign SMS.</li>
            <li>Messages are queued in the background with automatic retries (up to 3 attempts).</li>
          </ol>
          <H3>Sending Without Short Links</H3>
          <p className="mt-1">If your SMS template does not include the <code>{'{link}'}</code> placeholder, no short link will be included in the message. The system still processes contacts and sends SMS normally. This is useful for plain informational messages where click tracking is not needed.</p>
          <H3>Provider Failover</H3>
          <p className="mt-1">The system tries SMS providers in the priority order configured in workspace settings. If the primary provider fails, it automatically falls back to the secondary and then the fallback provider.</p>
        </Section>

        {/* ─── Personalization ─── */}
        <Section id="personalization" title="Personalization">
          <p>Both the Destination URL and SMS Template support dynamic placeholder variables that are replaced with each contact&rsquo;s data.</p>
          <H3>Available Placeholders</H3>
          <table className="w-full text-sm mt-2 border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr><th className="px-3 py-2 text-left">Placeholder</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Example</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="px-3 py-2"><code>{'{firstname}'}</code></td><td className="px-3 py-2">CSV firstname column</td><td className="px-3 py-2">Michael</td></tr>
              <tr><td className="px-3 py-2"><code>{'{phone}'}</code></td><td className="px-3 py-2">CSV phone column (normalized)</td><td className="px-3 py-2">2348012345678</td></tr>
              <tr><td className="px-3 py-2"><code>{'{link}'}</code></td><td className="px-3 py-2">Auto-generated short link</td><td className="px-3 py-2">s.cmaf.cc/AB/john</td></tr>
              <tr><td className="px-3 py-2"><code>{'{any_csv_column}'}</code></td><td className="px-3 py-2">Any column from CSV</td><td className="px-3 py-2">Lagos, ABJ788, etc.</td></tr>
            </tbody>
          </table>
          <H3>Example</H3>
          <div className="bg-gray-50 p-4 rounded-lg mt-2">
            <p className="text-xs text-gray-500 mb-1">SMS Template:</p>
            <p className="text-sm font-mono">Hi {'{firstname}'}, your ticket code is {'{ticket}'}. Visit {'{link}'} for details.</p>
            <p className="text-xs text-gray-500 mt-3 mb-1">Becomes (for contact Michael with ticket ABJ788):</p>
            <p className="text-sm font-mono">Hi Michael, your ticket code is ABJ788. Visit s.cmaf.cc/AB/michael for details.</p>
          </div>
          <p className="text-xs text-gray-500 mt-2">Note: Placeholders work even without short links. If <code>{'{link}'}</code> is omitted from the template, no short link URL is included in the message. All other CSV-based placeholders still work.</p>
        </Section>

        {/* ─── Triggers ─── */}
        <Section id="triggers" title="Triggers & Automation">
          <p>Triggers send automated follow-up SMS to contacts based on their behavior after receiving the initial campaign SMS.</p>
          <H3>Trigger Types</H3>
          <ul className="list-disc list-inside space-y-2 mt-2">
            <li><strong>On Click:</strong> Fires when a contact clicks their short link. Useful for thank-you messages or follow-up offers.</li>
            <li><strong>No Click:</strong> Fires after a configurable delay if the contact has NOT clicked. Useful for reminder messages.</li>
          </ul>
          <H3>Configuration</H3>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Delay (minutes):</strong> How long to wait before sending. For &ldquo;On Click,&rdquo; 0 means immediately after click.</li>
            <li><strong>Message Template:</strong> The SMS text (supports same placeholders as campaign SMS template).</li>
            <li><strong>Max Executions:</strong> How many times this trigger can fire per contact (1–10).</li>
          </ul>
          <H3>How Triggers Execute</H3>
          <p className="mt-1">Triggers are evaluated by a scheduled cron job that runs every minute. It checks all active trigger rules and their conditions, then queues SMS for matching contacts.</p>
        </Section>

        {/* ─── Analytics ─── */}
        <Section id="analytics" title="Analytics & Tracking">
          <p>Track campaign performance from the Dashboard and campaign detail pages.</p>
          <H3>Metrics Available</H3>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Total Contacts:</strong> Number of people uploaded per campaign.</li>
            <li><strong>Links Generated:</strong> Unique short links created (one per contact).</li>
            <li><strong>Total Clicks:</strong> Sum of all short link clicks in the campaign.</li>
            <li><strong>SMS Sent:</strong> Number of SMS messages dispatched.</li>
            <li><strong>Per-contact:</strong> SMS delivery status, click count, and trigger activity for each contact.</li>
          </ul>
          <H3>Click Logging</H3>
          <p className="mt-1">Every click on a short link is recorded with timestamp, user agent, and a hashed IP address for privacy. Click data is instantly available in the dashboard.</p>
        </Section>

        {/* ─── Settings ─── */}
        <Section id="settings" title="Settings & SMS Config">
          <H3>Workspace Settings</H3>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Name:</strong> The display name for the workspace.</li>
            <li><strong>Members:</strong> Add, remove, or change roles of team members.</li>
            <li><strong>Default Workspace:</strong> Set a workspace as your default to skip the chooser on login.</li>
          </ul>
          <H3>SMS Provider Configuration</H3>
          <p className="mt-1">Each workspace can configure its own SMS providers independently. The system supports three providers:</p>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li><strong>Kudi SMS</strong> — Nigerian SMS gateway. Requires API key and sender ID.</li>
            <li><strong>Termii</strong> — Multi-channel messaging platform. Requires API key and sender ID.</li>
            <li><strong>Africa&rsquo;s Talking</strong> — African communications API. Requires API key, username, and sender ID.</li>
          </ul>
          <p className="mt-2">Set the priority order (Primary → Secondary → Fallback) to control failover behavior. If the primary provider fails, the system automatically tries the next provider.</p>
        </Section>

        {/* ─── Authentication ─── */}
        <Section id="auth" title="Authentication">
          <H3>Google Sign-In (Primary)</H3>
          <p className="mt-1">The recommended login method. Uses Google OAuth 2.0 with domain restriction. Only users from the configured domain can sign in.</p>
          <H3>Password Login (Secondary)</H3>
          <p className="mt-1">Available for users who have a password set on their account. Both login methods can be used with the same account — they are tied together by email address.</p>
          <H3>Session Management</H3>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>Sessions last 30 minutes of inactivity and refresh automatically.</li>
            <li>Sessions are stored server-side in Cloudflare KV.</li>
            <li>Cookies are HttpOnly, SameSite=Lax, and Secure (in production).</li>
          </ul>
          <H3>Security</H3>
          <ul className="list-disc list-inside space-y-1 mt-1">
            <li>OAuth state parameter validated to prevent CSRF attacks.</li>
            <li>Password login rate-limited to 5 attempts per email per 5 minutes.</li>
            <li>Passwords stored as SHA-256 hashes with constant-time comparison.</li>
            <li>Users must be pre-invited — no self-registration.</li>
          </ul>
        </Section>

        {/* ─── Admin ─── */}
        <Section id="admin" title="Admin Panel">
          <p>Super admins have access to a global admin panel for managing the entire platform.</p>
          <H3>Admin Features</H3>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Users:</strong> View all users, invite new users, set passwords, manage super admin status.</li>
            <li><strong>Workspaces:</strong> View and manage all workspaces across the platform.</li>
            <li><strong>Dashboard:</strong> Global platform statistics.</li>
          </ul>
          <p className="mt-2">Access the admin panel via the profile menu (top-right) when logged in as a super admin.</p>
        </Section>

        {/* ─── Troubleshooting ─── */}
        <Section id="troubleshooting" title="Troubleshooting">
          <div className="space-y-4">
            <TsItem q="Google login shows 'redirect_uri_mismatch'">
              Ensure the Google Cloud Console redirect URI exactly matches: <code>https://api.cmaf.cc/api/auth/callback</code>. There should be no trailing slash.
            </TsItem>
            <TsItem q="Google login redirects to login page with 'invalid_state'">
              This can happen if the browser took too long between clicking login and completing the Google flow (state expires after 10 minutes), or if cookies are blocked. Try again, and ensure third-party cookies are enabled for the site.
            </TsItem>
            <TsItem q="Password login fails with 'Failed to fetch'">
              Verify that the API URL environment variable (<code>NEXT_PUBLIC_API_URL</code>) is set correctly and that the worker CORS configuration includes your frontend domain.
            </TsItem>
            <TsItem q="CSV upload fails or contacts are missing">
              Check that the CSV has <code>firstname</code> and <code>phone</code> columns (case-insensitive), the file is under 5MB, and has fewer than 5,000 rows. Invalid phone numbers are skipped.
            </TsItem>
            <TsItem q="SMS not sending">
              Ensure: (1) Campaign is Active, (2) SMS template is set, (3) At least one SMS provider is configured with valid API keys in workspace Settings → SMS Providers, (4) Contacts have valid phone numbers.
            </TsItem>
            <TsItem q="Short link redirects to fallback URL">
              The campaign is either paused or expired. Check the campaign status and resume or extend the end date if needed.
            </TsItem>
          </div>
        </Section>

        {/* ─── FAQ ─── */}
        <Section id="faq" title="FAQ">
          <div className="space-y-4">
            <TsItem q="Can I send SMS without creating short links?">
              Yes. If your SMS template does not include the <code>{'{link}'}</code> placeholder, the message will be sent as plain text without any short link. Contacts and their data (for personalization) still work normally.
            </TsItem>
            <TsItem q="Can I personalize SMS for each person?">
              Yes. Use placeholders like <code>{'{firstname}'}</code>, <code>{'{ticket}'}</code>, or any other column name from your CSV. For example: &ldquo;Hi {'{firstname}'}, your ticket is {'{ticket}'}&rdquo; becomes &ldquo;Hi Michael, your ticket is ABJ788&rdquo;.
            </TsItem>
            <TsItem q="Can I upload contacts without using short links?">
              Short links are auto-generated during CSV upload as part of the campaign flow. However, if your SMS template omits the <code>{'{link}'}</code> placeholder, the links simply won&rsquo;t be used in messages. The links still exist but consume minimal resources.
            </TsItem>
            <TsItem q="How do I change my default workspace?">
              Go to Settings in any workspace and toggle the &ldquo;Set this workspace as default&rdquo; option. This controls which workspace you land in after login.
            </TsItem>
            <TsItem q="What happens when a campaign expires?">
              All short links redirect to the Fallback URL. No new SMS can be sent. The campaign becomes read-only. Contacts and analytics data are preserved.
            </TsItem>
          </div>
        </Section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-100 text-left">
          <p className="text-[12px] md:text-[14px] text-gray-400 leading-relaxed">
            Made with <span className="text-red-500 text-left">❤</span> by CAL Digital Team
          </p>
         
        </footer>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} data-section className="mb-12 scroll-mt-8">
      <h2 className="font-display text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display text-base font-semibold text-gray-800 mt-4 mb-1">{children}</h3>;
}

function TsItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="font-medium text-gray-900 mb-1">{q}</p>
      <p className="text-gray-600">{children}</p>
    </div>
  );
}
