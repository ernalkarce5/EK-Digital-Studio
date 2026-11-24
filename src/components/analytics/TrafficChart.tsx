import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

export interface TrafficPoint {
  /** Bucket start date, YYYY-MM-DD. */
  bucket: string;
  views: number;
  visitors: number;
}

const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

const fmt = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

/** Clean y-axis maximum and ticks (0 plus ~4 steps of 1/2/5 × 10^n). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/**
 * Page views over time: one series (area wash + 2px line), crosshair tooltip on pointer and
 * keyboard (arrow keys), and an always-available table view. Text uses text tokens; only the
 * marks carry the accent colour.
 */
export function TrafficChart({ points, formatBucket }: { points: TrafficPoint[]; formatBucket: (bucket: string, long?: boolean) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const ticks = niceTicks(Math.max(0, ...points.map((p) => p.views)));
    const top = ticks[ticks.length - 1] || 1;
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join('');
    const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
    // Sparse x labels: at most ~6, always including the first and last.
    const maxLabels = Math.max(2, Math.floor(innerW / 90));
    const every = Math.max(1, Math.ceil(points.length / maxLabels));
    const labels = points.map((_, i) => i).filter((i) => i % every === 0 || i === points.length - 1);
    if (labels.length > 1 && labels[labels.length - 1] - labels[labels.length - 2] < every / 2) labels.splice(labels.length - 2, 1);
    return { ticks, x, y, line, area, labels, innerW };
  }, [points, width]);

  const pick = (clientX: number) => {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const rel = clientX - rect.left - PAD.left;
    const i = points.length <= 1 ? 0 : Math.round((rel / geo.innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? (e.key === 'ArrowRight' ? -1 : points.length);
        return Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(points.length - 1);
    else if (e.key === 'Escape') setActive(null);
  };

  const last = points.length - 1;
  const a = active != null ? points[active] : null;
  const total = points.reduce((n, p) => n + p.views, 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <button type="button" onClick={() => setShowTable((v) => !v)} className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline" aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">Page views and unique visitors per period</caption>
            <thead className="sticky top-0 bg-card text-left text-[12px] text-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Period</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Page views</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Unique visitors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {points.map((p) => (
                <tr key={p.bucket}>
                  <td className="px-3 py-2">{formatBucket(p.bucket, true)}</td>
                  <td className="px-3 py-2 text-right">{fmt.format(p.views)}</td>
                  <td className="px-3 py-2 text-right text-muted">{fmt.format(p.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative">
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-labelledby={titleId}
            tabIndex={0}
            className="block max-w-full touch-pan-y rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            onPointerMove={(e: PointerEvent) => pick(e.clientX)}
            onPointerDown={(e: PointerEvent) => pick(e.clientX)}
            onPointerLeave={(e: PointerEvent) => e.pointerType === 'mouse' && setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            <title id={titleId}>{`Page views over time: ${fmt.format(total)} in ${points.length} periods. Use the arrow keys to read each period, or show the table.`}</title>
            {/* Gridlines + y ticks */}
            {geo.ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-subtle text-[11px] tabular-nums">
                  {t >= 10000 ? compact.format(t) : fmt.format(t)}
                </text>
              </g>
            ))}
            {/* X labels */}
            {geo.labels.map((i) => (
              <text key={i} x={geo.x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-subtle text-[11px]">
                {formatBucket(points[i].bucket)}
              </text>
            ))}
            {/* Area wash + line */}
            {points.length > 1 && (
              <>
                <path d={geo.area} fill="var(--accent)" fillOpacity={0.1} />
                <path d={geo.line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {/* Crosshair */}
            {active != null && (
              <line x1={geo.x(active)} x2={geo.x(active)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="var(--subtle)" strokeWidth={1} shapeRendering="crispEdges" />
            )}
            {/* End dot (or the active point), with a 2px surface ring */}
            {points.length > 0 && (
              <circle
                cx={geo.x(active ?? last)}
                cy={geo.y(points[active ?? last].views)}
                r={4}
                fill="var(--accent)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            )}
          </svg>

          {a && active != null && (
            <div
              role="status"
              className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line-strong bg-bg-2 px-3 py-2 text-sm shadow-lg"
              style={geo.x(active) > width / 2 ? { right: width - geo.x(active) + 10 } : { left: geo.x(active) + 10 }}
            >
              <p className="text-[12px] text-subtle">{formatBucket(a.bucket, true)}</p>
              <p className="mt-1 flex items-center gap-2">
                <span className="size-2 rounded-full bg-accent" aria-hidden />
                <strong className="font-medium tabular-nums">{fmt.format(a.views)}</strong>
                <span className="text-muted">page views</span>
              </p>
              <p className="mt-0.5 pl-4 text-muted">
                <span className="tabular-nums text-fg">{fmt.format(a.visitors)}</span> unique visitors
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars (one hue): label and value always visible, share on hover/focus. */
export function BarList({
  items,
  label,
  empty = 'No data for this period yet.',
}: {
  items: Array<{ key: string; label: string; value: number; hint?: string }>;
  label: string;
  empty?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((n, i) => n + i.value, 0);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3.5" aria-label={label}>
      {items.map((i) => {
        const share = total ? Math.round((i.value / total) * 100) : 0;
        return (
          <li key={i.key} title={`${i.label}: ${fmt.format(i.value)} (${share}%)`} aria-label={`${i.label}: ${fmt.format(i.value)}, ${share}%`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {i.label}
                {i.hint && <span className="ml-1.5 text-[12px] text-subtle">{i.hint}</span>}
              </span>
              <span className="shrink-0 tabular-nums">
                {fmt.format(i.value)} <span className="ml-1 text-[12px] text-subtle">{share}%</span>
              </span>
            </div>
            <div className="h-2 rounded-r-[4px] bg-fg/[0.05]" aria-hidden>
              <div className={cn('h-full rounded-r-[4px] bg-accent', i.value === 0 && 'hidden')} style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
