import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Clock, Loader2, Lock, Send } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { BrandLoader } from '@/components/common/BrandLoader';
import { BrandMark } from '@/components/common/Logo';
import { FormField, Input, Select, Textarea } from '@/components/forms/Field';
import { QuestionnaireAnswersView } from '@/components/questionnaire/QuestionnaireAnswersView';
import { useSite } from '@/contexts/SiteContext';
import { openQuestionnaire, saveQuestionnaireDraft, submitQuestionnaire } from '@/services/questionnaires';
import {
  BUDGET_RANGES,
  CURRENCIES,
  FEATURES,
  LIMITS,
  linesToLinks,
  MAX_LINKS,
  MIN_DESCRIPTION,
  toPayload,
  URGENCIES,
  validateAnswers,
  VISUAL_STYLES,
  WEBSITE_TYPES,
  type AnswerKey,
  type Feature,
  type FieldErrors,
  type QuestionnaireAnswers,
} from '@/lib/questionnaire';
import { cn, formatDate } from '@/lib/utils';

type Phase = 'loading' | 'no-link' | 'unavailable' | 'busy' | 'error' | 'form' | 'done' | 'already';
type SaveState = { kind: 'idle' | 'saving' | 'saved' | 'error'; at?: string };

const STEPS = ['Website', 'Functionality', 'Design', 'Budget', 'Timeline', 'Additional', 'Review'] as const;
/** Which step shows each field (to jump to the first error). */
const FIELD_STEP: Record<AnswerKey, number> = {
  website_type: 0, website_type_other: 0, project_name: 0, project_description: 0,
  features: 1, features_other: 1,
  visual_style: 2, preferred_colors: 2, reference_links: 2, design_notes: 2,
  budget_range: 3, budget_currency: 3, budget_notes: 3,
  deadline: 4, urgency: 4, deadline_notes: 4,
  additional_requirements: 5, additional_links: 5,
};
const AUTOSAVE_MS = 1500;

/** Reads the token from the fragment once; the fragment is never sent to any server. */
function readToken(): string | null {
  const t = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t');
  return t && /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}

/**
 * Standalone client questionnaire (no account, no site navigation, not tracked by analytics).
 * The token stays in memory and is sent only in request bodies to the approved database functions.
 */
export default function QuestionnairePage() {
  const { settings } = useSite();
  const [token] = useState(readToken);
  const [phase, setPhase] = useState<Phase>('loading');
  const [firstName, setFirstName] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [linkText, setLinkText] = useState({ reference_links: '', additional_links: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [step, setStep] = useState(0);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const started = useRef(performance.now());
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(answers);
  latest.current = answers;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Privacy: remove the token from the address bar and history; no referrer from this page.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname);
    document.title = `Project questionnaire — ${settings.studio_name}`;
    const robots = document.querySelector('meta[name="robots"]') ?? Object.assign(document.head.appendChild(document.createElement('meta')), { name: 'robots' });
    robots.setAttribute('content', 'noindex, nofollow');
    const ref = document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'referrer', content: 'no-referrer' }));
    return () => ref.remove();
  }, [settings.studio_name]);

  // Opening a different link while this page is open only changes the fragment (no reload): start over.
  useEffect(() => {
    const onHash = () => {
      if (new URLSearchParams(window.location.hash.replace(/^#/, '')).has('t')) window.location.reload();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Open the questionnaire.
  useEffect(() => {
    if (!token) {
      setPhase('no-link');
      return;
    }
    let active = true;
    openQuestionnaire(token)
      .then((r) => {
        if (!active) return;
        if (!r.ok) return setPhase(r.error === 'rate_limited' ? 'busy' : 'unavailable');
        setFirstName(r.first_name);
        if (r.status === 'submitted') return setPhase('already');
        setAnswers(r.draft ?? {});
        setLinkText({ reference_links: (r.draft?.reference_links ?? []).join('\n'), additional_links: (r.draft?.additional_links ?? []).join('\n') });
        setExpiresAt(r.expires_at);
        if (r.draft_saved_at) setSave({ kind: 'saved', at: r.draft_saved_at });
        setPhase('form');
      })
      .catch(() => active && setPhase('error'));
    return () => {
      active = false;
    };
  }, [token]);

  const persist = useCallback(async () => {
    if (!token || !dirty.current) return;
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      const r = await saveQuestionnaireDraft(token, toPayload(latest.current));
      if (r.ok) return setSave({ kind: 'saved', at: r.saved_at });
      if (r.error === 'submitted') return setPhase('already');
      if (r.error === 'unavailable') return setPhase('unavailable');
      if (r.error === 'invalid' && r.field) setErrors((e) => ({ ...e, [r.field as AnswerKey]: r.message }));
      dirty.current = true;
      setSave({ kind: 'error' });
    } catch {
      dirty.current = true;
      setSave({ kind: 'error' });
    }
  }, [token]);

  // Debounced autosave; also flush when the tab is hidden.
  const schedule = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), AUTOSAVE_MS);
  }, [persist]);
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && void persist();
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.clearTimeout(timer.current);
    };
  }, [persist]);

  const set = <K extends AnswerKey>(key: K, value: QuestionnaireAnswers[K]) => {
    setAnswers((a) => {
      const next = { ...a, [key]: value };
      if (key === 'budget_range' && value === 'not_decided') delete next.budget_currency;
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
    schedule();
  };
  const setLinks = (key: 'reference_links' | 'additional_links', text: string) => {
    setLinkText((t) => ({ ...t, [key]: text }));
    set(key, linesToLinks(text));
  };

  const go = (next: number) => {
    // Validate formats of the step being left; required fields are checked before submitting.
    const stepErrors = Object.fromEntries(Object.entries(validateAnswers(answers, false)).filter(([k]) => FIELD_STEP[k as AnswerKey] === step));
    if (next > step && Object.keys(stepErrors).length) {
      setErrors((e) => ({ ...e, ...stepErrors }));
      return;
    }
    if (dirty.current) void persist();
    setStep(next);
    setSubmitError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const submit = async () => {
    const all = validateAnswers(answers, true);
    if (Object.keys(all).length) {
      setErrors(all);
      const first = Math.min(...Object.keys(all).map((k) => FIELD_STEP[k as AnswerKey]));
      setSubmitError('Some answers need attention before sending.');
      setStep(first);
      return;
    }
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    window.clearTimeout(timer.current);
    try {
      const r = await submitQuestionnaire(token, toPayload(answers), performance.now() - started.current, honeypot);
      if (r.ok) return setPhase('done');
      if (r.error === 'submitted') return setPhase('already');
      if (r.error === 'unavailable') return setPhase('unavailable');
      if (r.error === 'rate_limited') return setSubmitError('Too many attempts. Please wait a few minutes and try again.');
      if (r.error === 'invalid' && r.field) {
        setErrors({ [r.field]: r.message });
        if (r.field in FIELD_STEP) setStep(FIELD_STEP[r.field as AnswerKey]);
        setSubmitError(r.message ?? 'Some answers need attention before sending.');
      }
    } catch {
      setSubmitError('Your answers could not be sent. Check your connection and try again — nothing was lost.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <BrandMark size="sm" className="-ml-1.5" />
          <div className="leading-tight">
            <p className="text-sm font-medium">{settings.studio_name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-subtle">Project questionnaire</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        {phase === 'loading' && <BrandLoader size="md" label="Opening your questionnaire…" />}
        {phase === 'no-link' && <Notice title="Open the link from your message">This page only works with the personal link you received from {settings.studio_name}.</Notice>}
        {phase === 'unavailable' && (
          <Notice title="This questionnaire isn't available">
            The link may have expired, been replaced with a newer one, or is no longer needed. Please contact {settings.studio_name} if you'd still like to send
            your project details.
          </Notice>
        )}
        {phase === 'busy' && <Notice title="Please try again shortly">There were too many requests from this connection. Wait a few minutes and reload the page.</Notice>}
        {phase === 'error' && <Notice title="Something went wrong">The questionnaire could not be loaded. Check your connection and reload the page.</Notice>}
        {(phase === 'done' || phase === 'already') && (
          <Notice icon={CheckCircle2} tone="success" title={phase === 'done' ? `Thank you${firstName ? `, ${firstName}` : ''}!` : 'Already submitted'}>
            {phase === 'done'
              ? `Your answers were sent to ${settings.studio_name}. We'll review them and get back to you with next steps. You can close this page.`
              : `This questionnaire has already been submitted. If something changed, simply reply to ${settings.studio_name}'s message.`}
          </Notice>
        )}

        {phase === 'form' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{firstName ? `Hi ${firstName}, tell us about your project` : 'Tell us about your project'}</h1>
              <p className="mt-2 text-sm text-muted">
                It takes about 10 minutes. Only the website type and a short description are required — answer the rest as well as you can. Your answers
                are saved as you go{expiresAt ? `, and this link works until ${formatDate(expiresAt, { dateStyle: 'long' })}` : ''}.
              </p>
            </div>

            <Progress step={step} save={save} />

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (step < STEPS.length - 1) go(step + 1);
                else void submit();
              }}
              className="mt-6 rounded-2xl border border-line-strong bg-card p-5 shadow-2xl shadow-black/10 sm:p-7"
            >
              {/* Honeypot: invisible to people, filled by bots. */}
              <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
                <label htmlFor="q-website">Website</label>
                <input id="q-website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>

              <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <h2 ref={headingRef} tabIndex={-1} className="mb-6 text-lg font-medium outline-none">
                  {step < 6 ? `${step + 1}. ${STEPS[step]}` : 'Review your answers'}
                </h2>

                {step === 0 && (
                  <div className="grid gap-5">
                    <FormField label="What kind of website do you need?" htmlFor="q-website_type" required error={errors.website_type}>
                      <Select id="q-website_type" value={answers.website_type ?? ''} invalid={!!errors.website_type} onChange={(e) => set('website_type', (e.target.value || undefined) as QuestionnaireAnswers['website_type'])}>
                        <option value="">Choose…</option>
                        {Object.entries(WEBSITE_TYPES).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </Select>
                    </FormField>
                    {answers.website_type === 'other' && (
                      <Text k="website_type_other" label="What kind of website?" answers={answers} errors={errors} set={set} />
                    )}
                    <Text k="project_name" label="Business or project name" answers={answers} errors={errors} set={set} />
                    <Text
                      k="project_description"
                      label="Describe your business or project"
                      required
                      rows={6}
                      hint={`What you do, who it's for and what the website should achieve (at least ${MIN_DESCRIPTION} characters).`}
                      answers={answers}
                      errors={errors}
                      set={set}
                    />
                  </div>
                )}

                {step === 1 && (
                  <div className="grid gap-5">
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">Which features would you like? <span className="font-normal text-subtle">Choose any</span></legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(Object.entries(FEATURES) as Array<[Feature, string]>).map(([k, l]) => {
                          const checked = answers.features?.includes(k) ?? false;
                          return (
                            <label
                              key={k}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                                checked ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg/30',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => set('features', checked ? (answers.features ?? []).filter((f) => f !== k) : [...(answers.features ?? []), k])}
                                className="size-4 accent-[var(--accent)]"
                              />
                              {l}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    {(answers.features?.includes('other') || answers.features_other) && (
                      <Text k="features_other" label="Other functionality" rows={3} answers={answers} errors={errors} set={set} />
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-5">
                    <FormField label="Preferred visual style" htmlFor="q-visual_style" optional error={errors.visual_style}>
                      <Select id="q-visual_style" value={answers.visual_style ?? ''} onChange={(e) => set('visual_style', (e.target.value || undefined) as QuestionnaireAnswers['visual_style'])}>
                        <option value="">Choose…</option>
                        {Object.entries(VISUAL_STYLES).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </Select>
                    </FormField>
                    <Text k="preferred_colors" label="Preferred colours" hint="Brand colours, or colours you like / dislike." answers={answers} errors={errors} set={set} />
                    <Links k="reference_links" label="Websites you like" hint={`One link per line, up to ${MAX_LINKS}. Starting with https://`} text={linkText.reference_links} error={errors.reference_links} onChange={setLinks} />
                    <Text k="design_notes" label="Anything else about the design?" rows={3} answers={answers} errors={errors} set={set} />
                  </div>
                )}

                {step === 3 && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Budget range" htmlFor="q-budget_range" optional error={errors.budget_range}>
                      <Select id="q-budget_range" value={answers.budget_range ?? ''} onChange={(e) => set('budget_range', (e.target.value || undefined) as QuestionnaireAnswers['budget_range'])}>
                        <option value="">Choose…</option>
                        {Object.entries(BUDGET_RANGES).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label="Currency" htmlFor="q-budget_currency" optional={answers.budget_range === 'not_decided' || !answers.budget_range} required={!!answers.budget_range && answers.budget_range !== 'not_decided'} error={errors.budget_currency}>
                      <Select
                        id="q-budget_currency"
                        value={answers.budget_currency ?? ''}
                        disabled={answers.budget_range === 'not_decided'}
                        invalid={!!errors.budget_currency}
                        onChange={(e) => set('budget_currency', (e.target.value || undefined) as QuestionnaireAnswers['budget_currency'])}
                      >
                        <option value="">Choose…</option>
                        {Object.entries(CURRENCIES).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </Select>
                    </FormField>
                    <Text k="budget_notes" label="Anything to add about the budget?" rows={3} className="sm:col-span-2" answers={answers} errors={errors} set={set} />
                  </div>
                )}

                {step === 4 && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label="Desired completion date" htmlFor="q-deadline" optional error={errors.deadline}>
                      <Input id="q-deadline" type="date" value={answers.deadline ?? ''} invalid={!!errors.deadline} onChange={(e) => set('deadline', e.target.value || undefined)} />
                    </FormField>
                    <FormField label="How urgent is it?" htmlFor="q-urgency" optional error={errors.urgency}>
                      <Select id="q-urgency" value={answers.urgency ?? ''} onChange={(e) => set('urgency', (e.target.value || undefined) as QuestionnaireAnswers['urgency'])}>
                        <option value="">Choose…</option>
                        {Object.entries(URGENCIES).map(([k, l]) => (
                          <option key={k} value={k}>{l}</option>
                        ))}
                      </Select>
                    </FormField>
                    <Text k="deadline_notes" label="Anything to add about the timeline?" rows={3} className="sm:col-span-2" answers={answers} errors={errors} set={set} />
                  </div>
                )}

                {step === 5 && (
                  <div className="grid gap-5">
                    <Text k="additional_requirements" label="Other requirements" rows={5} hint="Content, languages, integrations, anything we should know." answers={answers} errors={errors} set={set} />
                    <Links k="additional_links" label="Additional links" hint={`One link per line, up to ${MAX_LINKS}.`} text={linkText.additional_links} error={errors.additional_links} onChange={setLinks} />
                  </div>
                )}

                {step === 6 && (
                  <div>
                    <p className="mb-5 text-sm text-muted">Check your answers. After sending, they can't be changed here — just reply to our message if something changes.</p>
                    <QuestionnaireAnswersView answers={toPayload(answers)} showEmpty onEdit={(i) => go(i)} />
                  </div>
                )}
              </motion.div>

              {submitError && (
                <p role="alert" className="mt-6 flex gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {submitError}
                </p>
              )}

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" icon={ArrowLeft} disabled={step === 0 || submitting} onClick={() => go(step - 1)}>
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="submit" arrow>
                    {step === 5 ? 'Review answers' : 'Continue'}
                  </Button>
                ) : (
                  <Button type="submit" icon={Send} loading={submitting}>
                    Send questionnaire
                  </Button>
                )}
              </div>
            </form>
            <p className="mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-subtle">
              <Lock className="-mt-0.5 mr-1.5 inline size-3.5" aria-hidden />
              Your answers are sent only to {settings.studio_name}. See the{' '}
              <a href="/privacy#questionnaires" className="underline underline-offset-2 hover:text-fg">
                privacy policy
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Progress({ step, save }: { step: number; save: SaveState }) {
  const pct = Math.round((step / (STEPS.length - 1)) * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <p className="text-muted">
          Step {step + 1} of {STEPS.length}: <span className="text-fg">{STEPS[step]}</span>
        </p>
        <p className="flex items-center gap-1.5 text-subtle" role="status" aria-live="polite">
          {save.kind === 'saving' && (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
            </>
          )}
          {save.kind === 'saved' && (
            <>
              <Check className="size-3.5 text-success" aria-hidden /> Saved
              {save.at ? ` ${new Date(save.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
            </>
          )}
          {save.kind === 'error' && (
            <>
              <Clock className="size-3.5 text-warning" aria-hidden /> Not saved yet — will retry
            </>
          )}
        </p>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-fg/[0.08]"
        role="progressbar"
        aria-label="Questionnaire progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-3 hidden grid-cols-7 gap-1 text-center text-[11px] text-subtle sm:grid" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s} className={cn(i === step && 'font-medium text-fg', i < step && 'text-muted')}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

type TextKey = keyof typeof LIMITS;
function Text({
  k,
  label,
  hint,
  required,
  rows,
  className,
  answers,
  errors,
  set,
}: {
  k: TextKey;
  label: string;
  hint?: string;
  required?: boolean;
  rows?: number;
  className?: string;
  answers: QuestionnaireAnswers;
  errors: FieldErrors;
  set: <K extends AnswerKey>(key: K, value: QuestionnaireAnswers[K]) => void;
}) {
  const id = `q-${k}`;
  const value = (answers[k] as string | undefined) ?? '';
  const max = LIMITS[k];
  return (
    <FormField label={label} htmlFor={id} required={required} optional={!required} hint={hint} error={errors[k]} className={className}>
      {rows ? (
        <Textarea id={id} rows={rows} maxLength={max} value={value} invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <Input id={id} maxLength={max} value={value} invalid={!!errors[k]} onChange={(e) => set(k, e.target.value)} />
      )}
    </FormField>
  );
}

function Links({
  k,
  label,
  hint,
  text,
  error,
  onChange,
}: {
  k: 'reference_links' | 'additional_links';
  label: string;
  hint: string;
  text: string;
  error?: string;
  onChange: (k: 'reference_links' | 'additional_links', text: string) => void;
}) {
  return (
    <FormField label={label} htmlFor={`q-${k}`} optional hint={hint} error={error}>
      <Textarea id={`q-${k}`} rows={3} value={text} invalid={!!error} placeholder="https://" onChange={(e) => onChange(k, e.target.value)} />
    </FormField>
  );
}

function Notice({
  title,
  children,
  icon: Icon = AlertCircle,
  tone = 'neutral',
}: {
  title: string;
  children: ReactNode;
  icon?: typeof AlertCircle;
  tone?: 'neutral' | 'success';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 max-w-lg rounded-2xl border border-line-strong bg-card p-8 text-center shadow-2xl shadow-black/10"
      role={tone === 'success' ? 'status' : 'alert'}
    >
      <Icon className={cn('mx-auto size-10', tone === 'success' ? 'text-success' : 'text-accent')} aria-hidden />
      <h1 className="mt-4 text-xl font-medium tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </motion.div>
  );
}
