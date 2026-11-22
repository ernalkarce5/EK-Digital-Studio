import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowUpRight, Star } from 'lucide-react';
import { SmartImage } from '@/components/common/SmartImage';
import { ProjectTypeBadge, Tag } from '@/components/common/Badge';
import { cn } from '@/lib/utils';
import type { ProjectWithCategory } from '@/types/database';

export function ProjectCard({
  project,
  index = 0,
  size = 'default',
  priority = false,
}: {
  project: ProjectWithCategory;
  index?: number;
  size?: 'default' | 'large';
  priority?: boolean;
}) {
  const techs = project.technologies.slice(0, size === 'large' ? 5 : 4);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: Math.min(index, 6) * 0.06 }}
      className="group relative flex flex-col"
    >
      <Link
        to={`/projects/${project.slug}`}
        className="absolute inset-0 z-10 rounded-[var(--radius-card)]"
        aria-label={`View details: ${project.title}`}
      />
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-line">
        <SmartImage
          path={project.cover_image_path}
          alt={project.cover_image_alt || `${project.title} cover`}
          priority={priority}
          className={cn('w-full', size === 'large' ? 'aspect-[16/10]' : 'aspect-[4/3]')}
          imgClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.035]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <ProjectTypeBadge type={project.project_type} className="bg-bg/85 backdrop-blur" />
          {project.is_featured && (
            <span className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-bg/85 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-fg backdrop-blur">
              <Star className="size-3 fill-current text-accent-2" aria-hidden /> Featured
            </span>
          )}
        </div>
        <span className="absolute bottom-3 right-3 grid size-10 translate-y-2 place-items-center rounded-full bg-fg text-bg opacity-0 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" aria-hidden />
        </span>
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <p className="eyebrow">{project.category?.name ?? 'Project'}</p>
        <h3
          className={cn(
            'mt-2 font-medium tracking-tight transition-colors group-hover:text-accent-2',
            size === 'large' ? 'text-2xl md:text-[28px]' : 'text-xl',
          )}
        >
          {project.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-muted">{project.short_description}</p>
        {techs.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Technologies">
            {techs.map((t) => (
              <li key={t}>
                <Tag>{t}</Tag>
              </li>
            ))}
          </ul>
        )}
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-fg">
          View Details
          <ArrowUpRight
            className="size-4 text-accent transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </motion.article>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      <div className="aspect-[4/3] animate-pulse rounded-[var(--radius-card)] bg-fg/[0.06]" />
      <div className="mt-5 h-3 w-24 animate-pulse rounded bg-fg/[0.06]" />
      <div className="mt-3 h-5 w-2/3 animate-pulse rounded bg-fg/[0.06]" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-fg/[0.06]" />
    </div>
  );
}
