import { BrandMark } from '@/components/common/Logo';
import { cn } from '@/lib/utils';

/**
 * Page-level loader with the uploaded logo: fade/scale-in, a soft breathing glow and a thin
 * sweeping progress line. Matches the static splash in index.html so the hand-over is seamless.
 * For loading states inside panels, keep using LoadingBlock.
 */
export function BrandLoader({
  label = 'Loading…',
  size = 'lg',
  className,
}: {
  label?: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn('flex min-h-[60dvh] flex-col items-center justify-center px-6', className)}>
      <div className="relative grid place-items-center">
        <span aria-hidden className={cn('ek-loader-glow absolute rounded-full', size === 'lg' ? 'size-32' : 'size-20')} />
        <BrandMark size={size === 'lg' ? 'xl' : 'lg'} className="ek-loader-mark relative" />
      </div>
      <div aria-hidden className={cn('relative mt-7 h-[2px] overflow-hidden rounded-full bg-fg/[0.08]', size === 'lg' ? 'w-28' : 'w-20')}>
        <span className="ek-loader-bar absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
      </div>
      <p className="ek-loader-label mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-subtle">{label}</p>
    </div>
  );
}
