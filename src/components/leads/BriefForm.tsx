import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { FormField, Input, Select, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { saveBrief, notifyLeadsChanged } from '@/services/leads';
import { BRIEF_PRIORITIES, BRIEF_PROJECT_TYPES } from '@/lib/leads';
import { toErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import type { ProjectBrief, ProjectBriefContent } from '@/types/database';

type TextKey = Exclude<keyof ProjectBriefContent, 'project_type' | 'deadline' | 'priority' | 'budget'>;

/** Field layout for the brief; also drives the read-only view. */
const SECTIONS: Array<{ id: string; title: string; fields: Array<{ key: TextKey; label: string; rows?: number; max: number; hint?: string }> }> = [
  {
    id: 'brief-details',
    title: 'Project details',
    fields: [
      { key: 'description', label: 'Project description', rows: 5, max: 5000 },
      { key: 'objectives', label: 'Main objectives', rows: 3, max: 5000 },
      { key: 'target_audience', label: 'Target audience', rows: 3, max: 3000 },
      { key: 'design_style', label: 'Desired design style', rows: 2, max: 3000 },
      { key: 'preferred_colors', label: 'Preferred colours', rows: 2, max: 1000 },
      { key: 'required_pages', label: 'Required pages', rows: 3, max: 3000, hint: 'One per line works well.' },
      { key: 'required_functionality', label: 'Required functionality', rows: 4, max: 5000 },
      { key: 'reference_websites', label: 'Reference websites', rows: 2, max: 3000, hint: 'Links the client likes, and why.' },
      { key: 'special_requirements', label: 'Special requirements', rows: 2, max: 3000 },
    ],
  },
  {
    id: 'brief-technical',
    title: 'Technical requirements',
    fields: [
      { key: 'preferred_technologies', label: 'Preferred technologies', rows: 2, max: 2000 },
      { key: 'frontend_requirements', label: 'Frontend requirements', rows: 2, max: 3000 },
      { key: 'backend_requirements', label: 'Backend requirements', rows: 2, max: 3000 },
      { key: 'database_requirements', label: 'Database requirements', rows: 2, max: 3000 },
      { key: 'integrations', label: 'Third-party integrations', rows: 2, max: 3000 },
      { key: 'hosting_requirements', label: 'Hosting / domain requirements', rows: 2, max: 2000 },
    ],
  },
];

const EMPTY: ProjectBriefContent = {
  project_type: null,
  description: '',
  objectives: '',
  target_audience: '',
  design_style: '',
  preferred_colors: '',
  required_pages: '',
  required_functionality: '',
  reference_websites: '',
  special_requirements: '',
  preferred_technologies: '',
  frontend_requirements: '',
  backend_requirements: '',
  database_requirements: '',
  integrations: '',
  hosting_requirements: '',
  budget: '',
  deadline: null,
  priority: null,
  additional_information: '',
};

type FormValues = Omit<ProjectBriefContent, 'project_type' | 'priority' | 'deadline'> & {
  project_type: string;
  priority: string;
  deadline: string;
};

const toForm = (b: ProjectBrief | null): FormValues => {
  const v = { ...EMPTY, ...(b ?? {}) };
  return { ...v, project_type: v.project_type ?? '', priority: v.priority ?? '', deadline: v.deadline ?? '' } as FormValues;
};

/** Only the content columns: ids, stamps and timestamps are never sent (column grants reject them). */
const toContent = (v: FormValues): ProjectBriefContent => {
  const src = v as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(EMPTY)) out[k] = typeof src[k] === 'string' ? (src[k] as string).trim() : src[k];
  return {
    ...(out as unknown as ProjectBriefContent),
    project_type: (v.project_type || null) as ProjectBriefContent['project_type'],
    priority: (v.priority || null) as ProjectBriefContent['priority'],
    deadline: v.deadline || null,
  };
};

export function BriefForm({
  messageId,
  brief,
  editable,
  onSaved,
}: {
  messageId: string;
  brief: ProjectBrief | null;
  editable: boolean;
  onSaved: (b: ProjectBrief) => void;
}) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<FormValues>({ defaultValues: toForm(brief) });

  // Sync when the stored brief changes, without discarding fields the user is editing.
  useEffect(() => reset(toForm(brief), { keepDirtyValues: true }), [brief?.updated_at, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await saveBrief(messageId, toContent(values));
      reset(toForm(saved));
      onSaved(saved);
      notifyLeadsChanged();
      toast.success('Project brief saved.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'The brief could not be saved.'));
    }
  });

  if (!editable) return <BriefView brief={brief} />;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <p className="text-sm text-muted">
        Fill in what you know. Drafts can be saved at any time, and no field is required.
        {brief?.updated_at && <span className="text-subtle"> Last saved {formatDate(brief.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}.</span>}
      </p>
      <Panel id="brief-type" title="Project type">
        <FormField label="Project type" htmlFor="brief-project_type" optional>
          <Select id="brief-project_type" {...register('project_type')}>
            <option value="">Not decided yet</option>
            {Object.entries(BRIEF_PROJECT_TYPES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
      </Panel>
      {SECTIONS.map((s) => (
        <Panel key={s.id} id={s.id} title={s.title}>
          <div className="grid gap-5 md:grid-cols-2">
            {s.fields.map((f) => (
              <FormField key={f.key} label={f.label} htmlFor={`brief-${f.key}`} optional hint={f.hint} className={(f.rows ?? 2) >= 3 ? 'md:col-span-2' : undefined}>
                <Textarea id={`brief-${f.key}`} rows={f.rows ?? 2} maxLength={f.max} {...register(f.key)} className="min-h-0" />
              </FormField>
            ))}
          </div>
        </Panel>
      ))}
      <Panel id="brief-business" title="Business information">
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Estimated budget" htmlFor="brief-budget" optional>
            <Input id="brief-budget" maxLength={200} placeholder="e.g. €2,000 – €3,000" {...register('budget')} />
          </FormField>
          <FormField label="Desired deadline" htmlFor="brief-deadline" optional>
            <Input id="brief-deadline" type="date" {...register('deadline')} />
          </FormField>
          <FormField label="Project priority" htmlFor="brief-priority" optional>
            <Select id="brief-priority" {...register('priority')}>
              <option value="">Not set</option>
              {Object.entries(BRIEF_PRIORITIES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Additional information" htmlFor="brief-additional_information" optional className="sm:col-span-3">
            <Textarea id="brief-additional_information" rows={3} maxLength={5000} {...register('additional_information')} />
          </FormField>
        </div>
      </Panel>
      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty && !!brief}>
          {brief ? 'Save brief' : 'Save draft'}
        </Button>
      </div>
    </form>
  );
}

/** Read-only brief (submitted/approved, or viewed by someone who cannot edit). */
export function BriefView({ brief }: { brief: ProjectBrief | null }) {
  if (!brief) return <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No project brief has been started yet.</p>;
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div key={label} className="min-w-0">
        <dt className="text-xs text-subtle">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{value}</dd>
      </div>
    ) : null;
  const empty = (fields: Array<string | null | undefined>) => fields.every((f) => !f);
  return (
    <div className="space-y-6">
      <Panel title="Overview">
        <dl className="grid gap-5 sm:grid-cols-4">
          {row('Project type', brief.project_type ? BRIEF_PROJECT_TYPES[brief.project_type] : 'Not decided')}
          {row('Budget', brief.budget || '—')}
          {row('Deadline', brief.deadline ? formatDate(brief.deadline) : '—')}
          {row('Priority', brief.priority ? BRIEF_PRIORITIES[brief.priority] : '—')}
        </dl>
      </Panel>
      {SECTIONS.map((s) => {
        const values = s.fields.map((f) => brief[f.key]);
        return (
          <Panel key={s.id} title={s.title}>
            {empty(values) ? (
              <p className="text-sm text-subtle">Nothing recorded.</p>
            ) : (
              <dl className="grid gap-5 md:grid-cols-2">{s.fields.map((f) => row(f.label, brief[f.key]))}</dl>
            )}
          </Panel>
        );
      })}
      {brief.additional_information && (
        <Panel title="Additional information">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{brief.additional_information}</p>
        </Panel>
      )}
    </div>
  );
}
