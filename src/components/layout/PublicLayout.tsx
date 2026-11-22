import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { isSupabaseConfigured } from '@/lib/supabase';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

export function PublicLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-accent-strong focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <ScrollToTop />
      {!isSupabaseConfigured && import.meta.env.DEV && (
        <div className="fixed bottom-4 left-4 z-[70] max-w-xs rounded-lg border border-warning/40 bg-card px-3 py-2 text-xs text-warning">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code>.
        </div>
      )}
      <Navbar />
      <motion.main
        id="main"
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1"
      >
        <Outlet />
      </motion.main>
      <Footer />
    </div>
  );
}
