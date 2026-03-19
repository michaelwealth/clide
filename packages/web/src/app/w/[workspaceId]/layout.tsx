import WorkspaceLayoutClient from './workspace-layout';
import { ReactNode } from 'react';

export const runtime = 'edge';
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceLayoutClient>{children}</WorkspaceLayoutClient>;
}
