import { Link } from 'react-router';
import { useSite } from '@/contexts/SiteContext';
import { mediaUrl } from '@/lib/storage';
import { cn } from '@/lib/utils';

/** Uploaded logo if set in Site Settings, otherwise the EK wordmark. */
export function Logo({ className, to = '/' }: { className?: string; to?: string }) {
  const { settings } = useSite();
  const logo = mediaUrl(settings.logo_path);

  return (
    <Link
      to={to}
      className={cn('group inline-flex items-center gap-2.5 rounded-md', className)}
      aria-label={`${settings.website_name}, home`}
    >
      {logo ? (
        <img src={logo} alt="" className="h-8 w-auto max-w-[160px] object-contain" />
      ) : (
        <>
          <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-card font-mono text-[12px] font-medium tracking-tight">
            <span className="text-fg">E</span>
            <span className="text-accent">K</span>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-medium tracking-tight">{settings.website_name}</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-subtle">
              {settings.studio_name}
            </span>
          </span>
        </>
      )}
    </Link>
  );
}
