import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

/** Chip input for short tags (e.g. technologies). Enter or comma adds a tag. */
export function TagInput({
  value,
  onChange,
  placeholder = 'Type and press Enter',
  max = 30,
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  max?: number;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim().slice(0, 40))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((t) => t.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-bg-2 px-2 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-fg/[0.07] py-1 pl-2 pr-1 text-xs">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded p-0.5 text-muted hover:text-fg"
            aria-label={`Remove ${tag}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={inputId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={value.length ? '' : placeholder}
        className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-[15px] placeholder:text-subtle focus:outline-none sm:text-sm"
      />
    </div>
  );
}
