import { useSite } from '@/contexts/SiteContext';
import { AVAILABILITY_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const DOT = {
  available: 'bg-success',
  limited: 'bg-warning',
  unavailable: 'bg-danger',
} as const;

/** Availability pill driven by Admin → Site Settings → Availability. */
export function Availability({ className }: { className?: string }) {
  const { settings, settingsLoaded } = useSite();
  if (!settingsLoaded) return null;
  const status = settings.availability_status;
  const label = settings.availability_note || AVAILABILITY_LABELS[status];
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-card/70 py-1.5 pl-3 pr-4 text-[13px] text-muted backdrop-blur',
        className,
      )}
    >
      <span className="relative flex size-2">
        {status !== 'unavailable' && (
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden', DOT[status])} />
        )}
        <span className={cn('relative inline-flex size-2 rounded-full', DOT[status])} />
      </span>
      {label}
    </p>
  );
}
