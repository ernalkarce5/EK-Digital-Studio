import { answerRows, type QuestionnaireAnswers } from '@/lib/questionnaire';
import { cn } from '@/lib/utils';

/**
 * Read-only answers, grouped by section. Used by the moderator review and by the client's
 * review-before-submit step. Links are plain text (never clickable) so nothing typed by a
 * client becomes a navigation target in the dashboard.
 */
export function QuestionnaireAnswersView({
  answers,
  showEmpty = false,
  onEdit,
  className,
}: {
  answers: QuestionnaireAnswers;
  showEmpty?: boolean;
  /** Client review step: offer "Edit" per section (index of the form step). */
  onEdit?: (sectionIndex: number) => void;
  className?: string;
}) {
  const sections = answerRows(answers);
  return (
    <div className={cn('space-y-6', className)}>
      {sections.map((s, i) => {
        const rows = showEmpty ? s.rows : s.rows.filter((r) => (Array.isArray(r.value) ? r.value.length : r.value));
        if (!rows.length && !onEdit) return null;
        return (
          <section key={s.section} aria-labelledby={`qa-${i}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 id={`qa-${i}`} className="eyebrow text-[10px]">
                {s.section}
              </h3>
              {onEdit && (
                <button type="button" onClick={() => onEdit(i)} className="text-[13px] text-accent-2 underline-offset-4 hover:underline light:text-accent">
                  Edit<span className="sr-only"> {s.section}</span>
                </button>
              )}
            </div>
            {rows.length ? (
              <dl className="divide-y divide-line rounded-lg border border-line">
                {rows.map((r) => (
                  <div key={r.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-[13px] text-subtle">{r.label}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">
                      {Array.isArray(r.value) ? (
                        r.value.length ? (
                          <ul className="space-y-1">
                            {r.value.map((v) => (
                              <li key={v} className="break-all">
                                {v}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-subtle">—</span>
                        )
                      ) : r.value ? (
                        r.value
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-subtle">Nothing added.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
