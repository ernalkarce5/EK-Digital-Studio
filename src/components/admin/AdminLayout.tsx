import { useLocation } from 'react-router';
import {
  Activity,
  ChartLine,
  ClipboardCheck,
  FolderKanban,
  Images,
  LayoutDashboard,
  Mail,
  MessageSquareQuote,
  Settings,
  Shapes,
  Tags,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { DashboardLayout, usePolledCount, type DashboardNavGroup } from '@/components/dashboard/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { countUnreadMessages } from '@/services/messages';
import { countBriefsAwaitingReview } from '@/services/leads';

export default function AdminLayout() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const unreadMessages = usePolledCount(isAdmin ? countUnreadMessages : null, ['ek:messages-changed', 'ek:leads-changed'], [isAdmin, pathname]);
  const briefsToReview = usePolledCount(isAdmin ? countBriefsAwaitingReview : null, ['ek:leads-changed'], [isAdmin, pathname]);

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/admin/analytics', label: 'Website Analytics', icon: ChartLine },
        { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
        { to: '/admin/categories', label: 'Categories', icon: Tags },
        { to: '/admin/services', label: 'Services', icon: Shapes },
        { to: '/admin/messages', label: 'Messages', icon: Mail, badge: unreadMessages },
        { to: '/admin/testimonials', label: 'Testimonials', icon: MessageSquareQuote },
        { to: '/admin/media', label: 'Media Library', icon: Images },
        { to: '/admin/profile', label: 'Profile', icon: UserRound },
        { to: '/admin/settings', label: 'Site Settings', icon: Settings },
      ],
    },
    {
      heading: 'Moderator Management',
      items: [
        { to: '/admin/moderators', label: 'Moderators', icon: Users },
        { to: '/admin/assignments', label: 'Assignments', icon: Workflow },
        { to: '/admin/briefs', label: 'Completed Briefs', icon: ClipboardCheck, badge: briefsToReview },
        { to: '/admin/activity', label: 'Activity Logs', icon: Activity },
      ],
    },
  ];

  return <DashboardLayout area="admin" label="Admin" groups={groups} />;
}
