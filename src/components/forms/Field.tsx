import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border bg-bg-2 px-3.5 text-[15px] text-fg placeholder:text-subtle transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/20 disabled:opacity-60 sm:text-sm';

const stateClass = (invalid?: boolean) => (invalid ? 'border-danger/70' : 'border-line-strong hover:border-fg/25');

/** Label + control + hint/error, with aria wiring handled by the caller via ids. */
export function FormField({
  label,
  htmlFor,
  required,
  optional,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-fg">
        <span>
          {label}
          {required && (
            <span className="ml-0.5 text-accent" aria-hidden>
              *
            </span>
          )}
        </span>
        {optional && <span className="text-xs font-normal text-subtle">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-[13px] text-subtle">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type WithInvalid = { invalid?: boolean };

export function Input({
  invalid,
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & WithInvalid & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={props.id ? `${props.id}-${invalid ? 'error' : 'hint'}` : undefined}
      className={cn(control, 'h-11', stateClass(invalid), className)}
      {...props}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & WithInvalid & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      aria-describedby={props.id ? `${props.id}-${invalid ? 'error' : 'hint'}` : undefined}
      className={cn(control, 'min-h-28 resize-y py-3 leading-relaxed', stateClass(invalid), className)}
      {...props}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & WithInvalid & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        aria-describedby={props.id ? `${props.id}-${invalid ? 'error' : 'hint'}` : undefined}
        className={cn(control, 'h-11 appearance-none pr-10', stateClass(invalid), className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

/** Accessible toggle switch backed by a checkbox. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-5 w-9 rounded-full bg-fg/15 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg" />
        <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-[13px] text-subtle">{description}</span>}
      </span>
    </label>
  );
}
