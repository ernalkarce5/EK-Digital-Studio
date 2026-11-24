import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CalendarDays, CalendarRange, CheckCircle2, Eye, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { useToast } from '@/contexts/ToastContext';
import { toErrorMessage } from '@/lib/errors';
import { AdminPageHeader, Panel } from '@/components/admin/AdminUI';
import { BarList, TrafficChart } from '@/components/analytics/TrafficChart';
import { ErrorState, Skeleton } from '@/components/common/Feedback';
import { Input } from '@/components/forms/Field';
import { useAsync } from '@/hooks/useAsync';
import {
  DEVICE_LABELS,
  getAnalyticsSummary,
  IP_HEADER_LABELS,
  verifyIpSource,
  type AnalyticsSummary,
  type IpVerification,
  PAGE_LABELS,
  SOURCE_LABELS,
  type AnalyticsGrain,
} from '@/services/analytics';
import { cn, formatDate } from '@/lib/utils';

type Preset = '7d' | '30d' | '90d' | '12m' | 'custom';
const PRESETS: Array<{ id: Preset; label: string; days?: number }> = [
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
  { id: '12m', label: '12 months', days: 365 },
  { id: 'custom', label: 'Custom' },
];
const GRAINS: Array<{ id: AnalyticsGrain; label: string }> = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

/** Local calendar date as YYYY-MM-DD. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmt = new Intl.NumberFormat();

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    // Phones: equal columns filling the width (no sideways scrolling); larger screens: compact row.
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-lg border border-line p-1 sm:flex sm:w-max"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('min-w-0 rounded-md px-1 py-1.5 text-[13px] whitespace-nowrap transition-colors sm:px-3 sm:text-sm', value === o.id ? 'bg-card text-fg shadow-sm' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** IP source verification and retention status (admin only). */
function DataSettingsPanel({ summary, onChanged }: { summary: AnalyticsSummary; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IpVerification | null>(null);
  const header = summary.ip_source.header;
  const verified = !!summary.ip_source.verified_at;

  const verify = async () => {
    setBusy(true);
    try {
      const r = await verifyIpSource();
      setResult(r);
      if (r.trusted_header) toast.success(`Verified: ${IP_HEADER_LABELS[r.trusted_header]} is set by the gateway.`);
      else toast.error('No IP header could be verified as gateway-controlled. IP-based features stay off.');
      onChanged();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Data quality & retention" className="mt-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="flex items-start gap-2 text-sm">
            {header ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            )}
            <span>
              {header ? (
                <>
                  Visitor IP source: <strong className="font-medium">{IP_HEADER_LABELS[header]}</strong>, verified{' '}
                  {formatDate(summary.ip_source.verified_at)}.
                </>
              ) : verified ? (
                <>No IP header could be verified as set by the gateway. Unique visitors are approximate and per-network flood limits are off.</>
              ) : (
                <>
                  IP source <strong className="font-medium">not verified yet</strong>. Until it is, no IP address is used: unique visitors are approximate
                  and per-network flood limits are off.
                </>
              )}
            </span>
          </p>
          <p className="mt-2 text-[13px] text-subtle">
            The check sends a fake test IP in every candidate header and trusts only a header the infrastructure overwrites. Run it again after
            infrastructure changes.
          </p>
          <Button size="sm" variant="secondary" icon={ShieldCheck} loading={busy} onClick={() => void verify()} className="mt-3">
            {header ? 'Verify again' : 'Verify IP source'}
          </Button>
          {result && (
            <ul className="mt-3 space-y-1 text-[13px]" aria-label="IP source check results">
              {result.checks.map((c) => (
                <li key={c.header} className="flex justify-between gap-3">
                  <span>{IP_HEADER_LABELS[c.header]}</span>
                  <span className="text-muted">{!c.present ? 'not present' : c.client_controlled ? 'client-controlled (rejected)' : 'set by gateway'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-sm">
          <p>
            Page views are deleted after <strong className="font-medium">{summary.retention_months} months</strong>; daily visitor codes&apos; random
            values after their day.
          </p>
          <p className="mt-2 text-[13px] text-subtle">
            {summary.cleanup_scheduled
              ? 'Cleanup runs every night (scheduled database job) and whenever this page is opened.'
              : 'No database scheduler is active, so cleanup runs whenever this page is opened and on the first visit of each day.'}{' '}
            Deleted data can remain in Supabase backups until they expire.
          </p>
        </div>
      </div>
    </Panel>
  );
}

export default function AnalyticsPage() {
  const [preset, setPreset] = useState<Preset>('30d');
  const [grain, setGrain] = useState<AnalyticsGrain>('day');
  const [custom, setCustom] = useState({ from: daysAgo(29), to: iso(new Date()) });

  const range = useMemo(() => {
    if (preset === 'custom') return custom;
    const days = PRESETS.find((p) => p.id === preset)!.days!;
    return { from: daysAgo(days - 1), to: iso(new Date()) };
  }, [preset, custom]);
  const rangeValid = range.from <= range.to;

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p === '12m') setGrain('month');
    else if (p === '90d') setGrain((g) => (g === 'day' ? 'week' : g));
    else if (p !== 'custom') setGrain('day');
  };

  const summary = useAsync(
    () => (rangeValid ? getAnalyticsSummary(range.from, range.to, grain) : Promise.reject(new Error('The start date must be before the end date.'))),
    [range.from, range.to, grain],
  );
  const s = summary.data;

  const formatBucket = (bucket: string, long = false) => {
    const d = parse(bucket);
    if (grain === 'month') return d.toLocaleDateString(undefined, { month: long ? 'long' : 'short', year: 'numeric' });
    if (grain === 'week') return `${long ? 'Week of ' : ''}${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(long ? { year: 'numeric' } : {}) })}`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(long ? { weekday: 'short', year: 'numeric' } : {}) });
  };

  const tiles = s
    ? [
        { label: 'Total page views', value: s.totals.all_time_views, icon: Eye, hint: `All recorded (last ${s.retention_months} months)` },
        { label: 'Unique visitors', value: s.totals.all_time_visitors, icon: Users, hint: 'Estimated, all recorded' },
        { label: "Today's views", value: s.totals.today_views, icon: CalendarDays, hint: 'Since midnight' },
        { label: "This month's views", value: s.totals.month_views, icon: CalendarRange, hint: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) },
      ]
    : [];

  return (
    <>
      <AdminPageHeader
        title="Website Analytics"
        description="Visits to the public website. Admin and moderator activity is never counted."
      />

      {/* Headline figures (all time / today / this month) */}
      {summary.error && !s ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Key figures">
          {!s
            ? Array.from({ length: 4 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-28" />
                </li>
              ))
            : tiles.map((t, i) => (
                <motion.li
                  key={t.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex h-full flex-col rounded-xl border border-line bg-card p-4"
                >
                  <span className="flex items-center justify-between gap-2 text-[13px] text-muted">
                    {t.label}
                    <t.icon className="size-4 shrink-0" aria-hidden />
                  </span>
                  <span className="mt-4 text-3xl font-medium tracking-tight">{fmt.format(t.value)}</span>
                  <span className="mt-1 text-[12px] text-subtle">{t.hint}</span>
                </motion.li>
              ))}
        </ul>
      )}

      {/* Filters: one row above the charts */}
      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl label="Date range" options={PRESETS} value={preset} onChange={choosePreset} />
        <SegmentedControl label="Group by" options={GRAINS} value={grain} onChange={setGrain} />
      </div>
      {preset === 'custom' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-[13px] text-muted">
            From
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 w-44" />
          </label>
          <label className="grid gap-1.5 text-[13px] text-muted">
            To
            <Input type="date" value={custom.to} min={custom.from} max={iso(new Date())} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 w-44" />
          </label>
        </div>
      )}

      {!summary.error && (
      <div className={cn('mt-6 grid gap-6 lg:grid-cols-3', summary.loading && s && 'opacity-60 transition-opacity')} aria-busy={summary.loading}>
        <Panel
          title="Page views over time"
          description={
            s
              ? `${fmt.format(s.range.views)} views · ${fmt.format(s.range.visitors)} unique visitors · ${formatDate(parse(range.from).toISOString())} – ${formatDate(parse(range.to).toISOString())}`
              : 'Loading…'
          }
          className="lg:col-span-3"
        >
          {!s ? <Skeleton className="h-64" /> : <TrafficChart points={s.series} formatBucket={formatBucket} />}
        </Panel>

        <Panel title="Most visited pages" description="Page views in the selected period.">
          {!s ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <BarList label="Most visited pages" items={s.pages.map((p) => ({ key: p.page, label: PAGE_LABELS[p.page], value: p.views }))} />
              {s.projects.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <p className="eyebrow mb-3 text-[10px]">Top projects</p>
                  <BarList label="Most viewed projects" items={s.projects.map((p) => ({ key: p.slug, label: p.slug.replace(/-/g, ' '), value: p.views }))} />
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Traffic sources" description="Where visits started (first page of each visit).">
          {!s ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <BarList label="Traffic sources" items={s.sources.map((x) => ({ key: x.source, label: SOURCE_LABELS[x.source], value: x.views }))} />
              {s.referrers.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <p className="eyebrow mb-3 text-[10px]">Other referring websites</p>
                  <BarList label="Referring websites" items={s.referrers.map((r) => ({ key: r.domain, label: r.domain, value: r.views }))} />
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Devices" description="Estimated from the browser.">
          {!s ? (
            <Skeleton className="h-48" />
          ) : (
            <BarList
              label="Devices"
              items={(s.devices.length ? (['mobile', 'desktop', 'tablet'] as const) : []).map((d) => {
                const row = s.devices.find((x) => x.device === d);
                return { key: d, label: DEVICE_LABELS[d], value: row?.views ?? 0, hint: row ? `${fmt.format(row.visitors)} visitors` : undefined };
              })}
              empty="No visits in this period yet."
            />
          )}
        </Panel>
      </div>
      )}

      {s && <DataSettingsPanel summary={s} onChanged={summary.reload} />}

      <p className="mt-8 flex gap-2.5 rounded-lg border border-line bg-card p-3.5 text-[13px] text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <span>
          Cookieless: no names, emails, IP addresses or device identifiers are stored. Unique visitors are estimated with a pseudonymous code that
          changes every day, so a person returning on another day is counted again. Bots, link previews, visitors who opted out and visitors with
          Do-Not-Track or Global Privacy Control are not counted. Data is kept for {s?.retention_months ?? 13} months.
          {s?.totals.first_view_at
            ? ` Counting since ${formatDate(s.totals.first_view_at)}.`
            : ' No visits recorded yet; counting starts with the first public page view after deployment.'}
        </span>
      </p>
    </>
  );
}
