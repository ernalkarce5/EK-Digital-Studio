import { motion } from 'framer-motion';
import { Home } from 'lucide-react';
import { Seo } from '@/components/common/Seo';
import { Button } from '@/components/common/Button';

export default function NotFoundPage({ message }: { message?: string }) {
  return (
    <section className="relative flex min-h-[80dvh] items-center overflow-hidden pt-24">
      <Seo title="Page not found" noindex />
      <div
        aria-hidden
        className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black,transparent)]"
      />
      <div className="container-page text-center">
        <motion.p
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-[clamp(7rem,26vw,16rem)] italic leading-none text-accent-2"
          aria-hidden
        >
          404
        </motion.p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight md:text-4xl">This page could not be found</h1>
        <p className="mx-auto mt-4 max-w-md text-muted">
          {message ?? 'The link may be broken, or the page may have been moved. Let’s get you back on track.'}
        </p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/" size="lg" icon={Home}>
            Back to Home
          </Button>
          <Button to="/projects" size="lg" variant="secondary">
            View projects
          </Button>
        </div>
      </div>
    </section>
  );
}
