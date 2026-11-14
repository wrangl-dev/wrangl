import type { ReactNode } from 'react';

import { useInViewOnce } from '../../lib/useInViewOnce';
import { cn } from '../../lib/utils';

/** Fades and lifts its children in once, when they scroll into view. */
export function Reveal({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, shown } = useInViewOnce<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn('reveal', shown && 'is-shown', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
