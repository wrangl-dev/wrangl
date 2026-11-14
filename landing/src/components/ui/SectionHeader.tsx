import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { Reveal } from './Reveal';

type SectionHeaderProps = {
  /** Mono section marker, e.g. "01 features". */
  marker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  titleId?: string;
};

export function SectionHeader({
  marker,
  title,
  description,
  className,
  titleClassName,
  descriptionClassName,
  titleId,
}: SectionHeaderProps) {
  return (
    <Reveal className={className}>
      {marker && (
        <p className="mb-6 font-mono text-sm text-gray-400">
          <span className="text-white">#</span> {marker}
        </p>
      )}
      <h2
        id={titleId}
        className={cn('text-4xl font-semibold tracking-tight text-balance text-white md:text-6xl', titleClassName)}
      >
        {title}
      </h2>
      {description && (
        <p className={cn('mt-5 max-w-2xl text-lg leading-relaxed text-gray-400', descriptionClassName)}>
          {description}
        </p>
      )}
    </Reveal>
  );
}
