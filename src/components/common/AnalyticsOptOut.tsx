import { useEffect, useState } from 'react';
import { BarChart3, EyeOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { isOptedOut, setOptedOut, trackingAllowed } from '@/lib/analytics';

/**
 * "Don't count my visits" control for the Privacy Policy. Opting out stops page-view requests
 * entirely (no visitor code is ever calculated). The choice is one local-storage flag.
 */
export function AnalyticsOptOut() {
  const [optedOut, setState] = useState(false);
  const [browserSignal, setBrowserSignal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(isOptedOut());
    // Do-Not-Track / Global Privacy Control already switch counting off, independently of this choice.
    setBrowserSignal(!isOptedOut() && !trackingAllowed());
  }, []);

  const toggle = () => {
    const next = !optedOut;
    if (!setOptedOut(next)) {
      setError('Your browser blocked saving this choice. Turning on Do-Not-Track or Global Privacy Control has the same effect.');
      return;
    }
    setError(null);
    setState(next);
  };

  return (
    <div className="mt-2 rounded-xl border border-line-strong bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-3 text-sm text-fg" role="status" aria-live="polite">
          {optedOut ? <EyeOff className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> : <BarChart3 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />}
          <span>
            {optedOut
              ? 'Your visits are not counted on this device.'
              : browserSignal
                ? 'Your browser sends a Do-Not-Track or Global Privacy Control signal, so your visits are not counted.'
                : 'Your visits are counted in the visit statistics described above.'}
          </span>
        </p>
        <Button size="sm" variant={optedOut ? 'secondary' : 'primary'} onClick={toggle} className="shrink-0">
          {optedOut ? 'Count my visits again' : "Don't count my visits"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-[13px] text-subtle">Saved on this device only. If you use several browsers or devices, choose it on each.</p>
    </div>
  );
}
