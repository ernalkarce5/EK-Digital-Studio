import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = ['Discovery notes', 'Wireframes approved', 'Design system ready', 'Components built', 'Deploying to production'];

/** Block layout of a page being assembled inside a browser frame. */
const BLOCKS = [
  { x: 0, y: 0, w: 12, h: 1, tone: 'line' },
  { x: 0, y: 2, w: 7, h: 4, tone: 'accent' },
  { x: 8, y: 2, w: 4, h: 4, tone: 'card' },
  { x: 0, y: 7, w: 4, h: 3, tone: 'card' },
  { x: 4, y: 7, w: 4, h: 3, tone: 'card' },
  { x: 8, y: 7, w: 4, h: 3, tone: 'card' },
] as const;

function BuildLog() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? STEPS.length - 1 : 0);

  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setStep((s) => (s + 1) % (STEPS.length + 2)), 1400);
    return () => window.clearInterval(t);
  }, [reduce]);

  return (
    <ul className="space-y-2 font-mono text-[11px] sm:text-xs">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex items-center gap-2.5">
            <span className="grid size-4 place-items-center">
              <AnimatePresence mode="wait" initial={false}>
                {done ? (
                  <motion.span key="d" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Check className="size-3.5 text-success" />
                  </motion.span>
                ) : active ? (
                  <motion.span key="a" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 className="size-3.5 animate-spin text-accent" />
                  </motion.span>
                ) : (
                  <motion.span key="p" className="size-1.5 rounded-full bg-fg/20" />
                )}
              </AnimatePresence>
            </span>
            <span className={done || active ? 'text-fg' : 'text-subtle'}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Decorative hero illustration: a page assembling itself, plus a build log. */
export function HeroVisual() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[560px] select-none">
      <div className="absolute -inset-10 -z-10 rounded-full bg-accent/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 1.1, ease: EASE, delay: 0.25 }}
        className="relative overflow-hidden rounded-2xl border border-line-strong bg-card/90 shadow-2xl shadow-black/40 backdrop-blur [transform-perspective:1200px]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-2.5 rounded-full bg-fg/15" />
          <span className="size-2.5 rounded-full bg-fg/15" />
          <span className="size-2.5 rounded-full bg-fg/15" />
          <span className="ml-3 h-5 flex-1 rounded-md bg-fg/[0.05] px-2 font-mono text-[10px] leading-5 text-subtle">
            your-business.com
          </span>
        </div>
        <div className="grid grid-cols-12 grid-rows-[repeat(10,18px)] gap-2 p-4 sm:grid-rows-[repeat(10,22px)] sm:p-5">
          {BLOCKS.map((b, i) => (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.6 + i * 0.12 }}
              style={{ gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` }}
              className={
                b.tone === 'accent'
                  ? 'relative overflow-hidden rounded-lg bg-gradient-to-br from-accent/80 to-accent-2/50'
                  : b.tone === 'line'
                    ? 'flex items-center justify-between rounded-md'
                    : 'rounded-lg border border-line bg-fg/[0.03]'
              }
            >
              {b.tone === 'line' && (
                <>
                  <span className="h-2 w-16 rounded-full bg-fg/25" />
                  <span className="flex gap-2">
                    <span className="h-2 w-8 rounded-full bg-fg/10" />
                    <span className="h-2 w-8 rounded-full bg-fg/10" />
                    <span className="h-2 w-10 rounded-full bg-accent/60" />
                  </span>
                </>
              )}
              {b.tone === 'accent' && (
                <div className="absolute inset-x-4 bottom-4 space-y-2">
                  <span className="block h-2.5 w-3/4 rounded-full bg-white/80" />
                  <span className="block h-2.5 w-1/2 rounded-full bg-white/50" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20, y: 20 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 1, ease: EASE, delay: 0.9 }}
        className="absolute -bottom-10 -left-2 w-[230px] rounded-xl border border-line-strong bg-bg-2/95 p-4 shadow-2xl shadow-black/40 backdrop-blur sm:-left-10 sm:w-[250px]"
      >
        <p className="eyebrow mb-3 text-[10px]">Build log</p>
        <BuildLog />
      </motion.div>
    </div>
  );
}
