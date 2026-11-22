import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Fades content up into view once, when scrolled into the viewport.
 *
 * `solid`: the element itself (and its background) stays visible and only an
 * inner wrapper animates. Use it for cells of "divided" grids whose container
 * background forms the divider lines; otherwise that background shows through
 * as a grey block until the cells fade in.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = 'div',
  solid = false,
  innerClassName,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
  solid?: boolean;
  innerClassName?: string;
} & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const Component = motion[as] as typeof motion.div;
  const animation = {
    initial: { opacity: 0, y },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '0px 0px -10% 0px' },
    transition: { duration: 0.8, ease: EASE, delay },
  };

  if (solid) {
    return (
      <Component className={className} {...rest}>
        <motion.div {...animation} className={innerClassName}>
          {children}
        </motion.div>
      </Component>
    );
  }

  return (
    <Component {...animation} className={className} {...rest}>
      {children}
    </Component>
  );
}

export const easeOutExpo = EASE;
