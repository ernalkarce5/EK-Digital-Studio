import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  /** Shows an arrow that nudges on hover. */
  arrow?: boolean;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

type AsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined };
type AsLink = CommonProps & { to: string; href?: undefined; onClick?: () => void; 'aria-label'?: string };
type AsAnchor = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; to?: undefined };
export type ButtonProps = AsButton | AsLink | AsAnchor;

const VARIANTS: Record<Variant, string> = {
  primary:
    // accent-strong keeps white text ≥ 5:1 (WCAG AA); hover darkens so contrast only improves.
    'bg-accent-strong text-accent-fg hover:bg-accent-strong-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]',
  secondary: 'border border-line-strong text-fg hover:border-fg/40 hover:bg-fg/[0.04]',
  ghost: 'text-muted hover:text-fg hover:bg-fg/[0.05]',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-6 text-[15px] gap-2.5',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(
    'group/btn relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-200 ease-out active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

function Inner({ icon: Icon, arrow, loading, children }: CommonProps) {
  return (
    <>
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4 shrink-0" aria-hidden />
      )}
      {children}
      {arrow && (
        <ArrowUpRight
          className="size-4 shrink-0 transition-transform duration-300 ease-out group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5"
          aria-hidden
        />
      )}
    </>
  );
}

export function Button(props: ButtonProps) {
  const { variant, size, icon, arrow, loading, className, children } = props;
  const classes = buttonClasses(variant, size, className);
  const inner = (
    <Inner icon={icon} arrow={arrow} loading={loading}>
      {children}
    </Inner>
  );

  if ('to' in props && props.to !== undefined) {
    return (
      <Link to={props.to} onClick={props.onClick} aria-label={props['aria-label']} className={classes}>
        {inner}
      </Link>
    );
  }
  if ('href' in props && props.href !== undefined) {
    const { variant: _v, size: _s, icon: _i, arrow: _a, loading: _l, className: _c, children: _ch, ...rest } =
      props as AsAnchor;
    return (
      <a {...rest} className={classes}>
        {inner}
      </a>
    );
  }
  const { variant: _v, size: _s, icon: _i, arrow: _a, loading: _l, className: _c, children: _ch, ...rest } =
    props as AsButton;
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined} className={classes}>
      {inner}
    </button>
  );
}
