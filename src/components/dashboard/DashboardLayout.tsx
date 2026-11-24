import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ExternalLink, LogOut, Menu, Moon, Sun, X, type LucideIcon } from 'lucide-react';
import { AREA_PATHS, useAuth, type AuthArea } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useSite } from '@/contexts/SiteContext';
import { BrandLoader } from '@/components/common/BrandLoader';
import { BrandMark } from '@/components/common/Logo';
import { countUnreadNotifications } from '@/services/notifications';
import { isSupabaseConfigured } from '@/lib/supabase';
import { toErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';

export interface DashboardNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
}
export interface DashboardNavGroup {
  heading?: string;
  items: DashboardNavItem[];
}

/** Polls a count on navigation, on a custom window event and every minute while visible. */
export function usePolledCount(load: (() => Promise<number>) | null, events: string[], deps: unknown[]): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!load) return;
    let active = true;
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      load()
        .then((n) => active && setCount(n))
        .catch(() => {});
    };
    run();
    for (const e of events) window.addEventListener(e, run);
    const timer = window.setInterval(run, 60_000);
    return () => {
      active = false;
      for (const e of events) window.removeEventListener(e, run);
      window.clearInterval(timer);
    };
    // `deps` re-trigger loading (e.g. on navigation).
  }, deps);
  return count;
}

function NotificationBell({ to, unread, className }: { to: string; unread: number; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('relative grid size-9 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-fg', className)}
      aria-label={unread ? `Notifications: ${unread} new` : 'Notifications'}
      title="Notifications"
    >
      <Bell className="size-4" aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent-strong px-1 text-center font-mono text-[10px] leading-4 text-accent-fg">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({
  label,
  groups,
  unread,
  notificationsTo,
  onLogout,
}: {
  label: string;
  groups: DashboardNavGroup[];
  unread: number;
  notificationsTo: string;
  onLogout: () => void;
}) {
  const { settings } = useSite();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-line px-5">
        <BrandMark size="sm" className="-ml-1.5" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{settings.studio_name}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-subtle">{label}</p>
        </div>
        <NotificationBell to={notificationsTo} unread={unread} className="hidden lg:grid" />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={label}>
        {groups.map((group, gi) => (
          <div key={group.heading ?? gi} className={cn(gi > 0 && 'mt-5')}>
            {group.heading && <p className="eyebrow mb-2 px-3 text-[10px]">{group.heading}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end ?? false}
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
                            layoutId={`${label}-nav`}
                            className="absolute inset-0 rounded-lg border border-line-strong bg-card"
                            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                          />
                        )}
                        <item.icon className={cn('relative size-4', isActive && 'text-accent')} aria-hidden />
                        <span className="relative flex-1">{item.label}</span>
                        {!!item.badge && item.badge > 0 && (
                          <span
                            className="relative rounded-full bg-accent-strong px-1.5 py-px font-mono text-[10px] text-accent-fg"
                            aria-label={`${item.badge} unread`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
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

/**
 * Shared shell for the Admin and Moderator dashboards: role guard (server-verified
 * role from AuthContext), sidebar, mobile drawer, notification bell and page transition.
 */
export function DashboardLayout({
  area,
  label,
  groups,
  children,
}: {
  area: AuthArea;
  label: string;
  groups: DashboardNavGroup[];
  children?: ReactNode;
}) {
  const { session, role, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const paths = AREA_PATHS[area];
  const allowed = !!session && role === area;
  const unread = usePolledCount(allowed ? countUnreadNotifications : null, ['ek:notifications-changed', 'ek:leads-changed'], [
    allowed,
    location.pathname,
  ]);

  useEffect(() => {
    document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex, nofollow');
    document.title = label;
  }, [location.pathname, label]);

  useEffect(() => setOpen(false), [location.pathname]);

  if (!isSupabaseConfigured) return <Navigate to={paths.login} replace />;
  if (loading) return <BrandLoader className="min-h-dvh" label="Checking session…" />;
  if (!session) return <Navigate to={paths.login} replace state={{ from: location.pathname + location.search }} />;
  if (role !== area) {
    // Signed in with the other role: send them to their own dashboard.
    return <Navigate to={role ? AREA_PATHS[role].home : paths.login} replace />;
  }

  const logout = async () => {
    try {
      await signOut();
      navigate(paths.login, { replace: true });
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const notificationsTo = `${paths.home}/notifications`;
  const anyBadge = unread > 0 || groups.some((g) => g.items.some((i) => (i.badge ?? 0) > 0));

  return (
    <div className="min-h-dvh bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-bg-2 lg:block">
        <SidebarContent label={label} groups={groups} unread={unread} notificationsTo={notificationsTo} onLogout={logout} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
        <Link to={paths.home} className="-ml-1.5 flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <BrandMark size="sm" />
          <span className="truncate">{label}</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell to={notificationsTo} unread={unread} />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative grid size-10 place-items-center rounded-lg hover:bg-fg/5"
            aria-label={`Open ${label.toLowerCase()} menu`}
            aria-expanded={open}
          >
            <Menu className="size-5" />
            {anyBadge && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent" aria-hidden />}
          </button>
        </div>
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
              aria-label={`${label} menu`}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-lg text-muted hover:bg-fg/5"
                aria-label={`Close ${label.toLowerCase()} menu`}
              >
                <X className="size-4" />
              </button>
              <SidebarContent label={label} groups={groups} unread={unread} notificationsTo={notificationsTo} onLogout={logout} />
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
          {children ?? <Outlet />}
        </motion.div>
      </main>
    </div>
  );
}
