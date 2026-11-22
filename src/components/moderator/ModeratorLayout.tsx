import { Archive, ClipboardList, Inbox, LayoutDashboard, MessagesSquare, UserCog } from 'lucide-react';
import { DashboardLayout, type DashboardNavGroup } from '@/components/dashboard/DashboardLayout';

const GROUPS: DashboardNavGroup[] = [
  {
    items: [
      { to: '/moderator', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/moderator/leads', label: 'Assigned Leads', icon: Inbox },
      { to: '/moderator/communication', label: 'Client Communication', icon: MessagesSquare },
      { to: '/moderator/briefs', label: 'Project Briefs', icon: ClipboardList },
      { to: '/moderator/archive', label: 'Archive', icon: Archive },
      { to: '/moderator/profile', label: 'Profile & Settings', icon: UserCog },
    ],
  },
];

export default function ModeratorLayout() {
  return <DashboardLayout area="moderator" label="Moderator" groups={GROUPS} />;
}
