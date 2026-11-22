import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ExternalLink,
  FolderKanban,
  Images,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareQuote,
  Moon,
  Settings,
  Shapes,
  Sun,
  Tags,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useSite } from '@/contexts/SiteContext';
import { LoadingBlock } from '@/components/common/Feedback';
import { countUnreadMessages } from '@/services/messages';
import { isSupabaseConfigured } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/services', label: 'Services', icon: Shapes },
  { to: '/admin/messages', label: 'Messages', icon: Mail, badge: true },
  { to: '/admin/testimonials', label: 'Testimonials', icon: MessageSquareQuote },
  { to: '/admin/media', label: 'Media Library', icon: Images },
  { to: '/admin/profile', label: 'Profile', icon: UserRound },
  { to: '/admin/settings', label: 'Site Settings', icon: Settings },
] as const;

function SidebarContent({ unread, onLogout }: { unread: number; onLogout: () => void }) {
  const { settings } = useSite();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <span className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-card font-mono text-[12px] font-medium">
          E<span className="text-accent">K</span>
        </span>
        <div className="leading-tight">
          <p className="text-sm font-medium">{settings.studio_name}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-subtle">Admin</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin">
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                    isActive ? 'text-fg' : 'text-muted hover:bg-fg/[0.04] hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="admin-nav"
                        className="absolute inset-0 rounded-lg border border-line-strong bg-card"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                    <item.icon className={cn('relative size-4', isActive && 'text-accent')} aria-hidden />
                    <span className="relative flex-1">{item.label}</span>
                    {'badge' in item && unread > 0 && (
                      <span
                        className="relative rounded-full bg-accent-strong px-1.5 py-px font-mono text-[10px] text-accent-fg"
                        aria-label={`${unread} unread`}
                      >
                        {unread}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-fg/[0.04] hover:text-fg"
        >
          <ExternalLink className="size-4" aria-hidden /> View website
        </a>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-fg/[0.04] hover:text-fg"
        >
          {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-danger/10 hover:text-danger"
        >
          <LogOut className="size-4" aria-hidden /> Logout
        </button>
        {user?.email && <p className="truncate px-3 pt-2 text-xs text-subtle">{user.email}</p>}
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { session, isAdmin, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
    document.title = 'Admin';
  }, [location.pathname]);

  useEffect(() => setOpen(false), [location.pathname]);

  // Refresh unread count on navigation and when messages change.
  useEffect(() => {
    if (!isAdmin) return;
    const load = () => countUnreadMessages().then(setUnread).catch(() => {});
    load();
    window.addEventListener('ek:messages-changed', load);
    return () => window.removeEventListener('ek:messages-changed', load);
  }, [isAdmin, location.pathname]);

  if (!isSupabaseConfigured) return <Navigate to="/admin/login" replace />;
  if (loading) return <LoadingBlock className="min-h-dvh" label="Checking session…" />;
  if (!session || !isAdmin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }

  const logout = async () => {
    try {
      await signOut();
      navigate('/admin/login', { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-bg-2 lg:block">
        <SidebarContent unread={unread} onLogout={logout} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Link to="/admin" className="text-sm font-medium">
          Admin
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-lg hover:bg-fg/5"
          aria-label="Open admin menu"
          aria-expanded={open}
        >
          <Menu className="size-5" />
          {unread > 0 && <span className="absolute right-4 top-3 size-2 rounded-full bg-accent" aria-hidden />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-overlay lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-line bg-bg-2 lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              role="dialog"
              aria-modal="true"
              aria-label="Admin menu"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-lg text-muted hover:bg-fg/5"
                aria-label="Close admin menu"
              >
                <X className="size-4" />
              </button>
              <SidebarContent unread={unread} onLogout={logout} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="lg:pl-64">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
