import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/** Replaces __SITE_URL__ in index.html (absolute og:image / twitter:image URLs). */
function siteUrl(mode: string): Plugin {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const origin = (env.VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
    name: 'ek-site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', origin),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteUrl(mode)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
}));
