export function CampaignStatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const classes: Record<string, string> = {
    draft: 'badge-gray',
    scheduled: 'badge-blue',
    active: 'badge-green',
    paused: 'badge-yellow',
    expired: 'badge-red',
  };
  return <span className={`${classes[status] || 'badge-gray'} ${className}`}>{status}</span>;
}
