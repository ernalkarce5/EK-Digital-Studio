import { Link } from 'react-router';
import { useSite } from '@/contexts/SiteContext';
import { mediaUrl } from '@/lib/storage';
import { readCachedLogo } from '@/lib/brand';
import { cn } from '@/lib/utils';

/** URL of the uploaded logo (Site Settings), using the cached URL until settings have loaded. */
export function useLogoUrl(): string | null {
  const { settings, settingsLoaded } = useSite();
  const url = mediaUrl(settings.logo_path);
  return settingsLoaded ? url : (url ?? readCachedLogo());
}

const MARK_SIZES = {
  sm: { img: 'h-8 w-12', mono: 'size-8 text-[12px] rounded-lg' },
  md: { img: 'h-10 w-[60px]', mono: 'size-9 text-[13px] rounded-lg' },
  lg: { img: 'h-16 w-24', mono: 'size-12 text-base rounded-xl' },
  xl: { img: 'h-24 w-36', mono: 'size-16 text-lg rounded-2xl' },
} as const;

/** The uploaded logo image, or the EK monogram when no logo is set. Decorative (alt=""). */
export function BrandMark({ size = 'sm', className }: { size?: keyof typeof MARK_SIZES; className?: string }) {
  const logo = useLogoUrl();
  const s = MARK_SIZES[size];
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        aria-hidden
        decoding="async"
        draggable={false}
        className={cn('brand-logo shrink-0 select-none object-contain', s.img, className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center border border-line-strong bg-card font-mono font-medium tracking-tight', s.mono, className)}
    >
      <span className="text-fg">E</span>
      <span className="text-accent">K</span>
    </span>
  );
}

/** Logo mark + site name, linking home. Used in the navbar and footer. */
export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  const { settings } = useSite();
  return (
    <Link
      to={to}
      className={cn('group inline-flex items-center gap-2 rounded-md', className)}
      aria-label={`${settings.website_name}, home`}
    >
      {/* The image has transparent padding; negative margins keep the row height unchanged. */}
      <BrandMark size="md" className="-my-1 -ml-1.5 transition-transform duration-300 ease-out group-hover:scale-[1.04]" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-medium tracking-tight">{settings.website_name}</span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-subtle">{settings.studio_name}</span>
      </span>
    </Link>
  );
}
