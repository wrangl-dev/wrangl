import { Link } from 'react-router';

import { cn } from '../../lib/utils';
import { Mark } from './Mark';

interface LogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export const Logo = ({ className, iconClassName, textClassName }: LogoProps) => {
  return (
    <Link
      to="/"
      aria-label="Wrangl home"
      className={cn(
        'flex items-center gap-3 text-white transition-opacity duration-150 ease-[var(--ease-out)] hover:opacity-70',
        className,
      )}
    >
      <Mark className={cn('h-5 w-auto shrink-0', iconClassName)} />
      <span className={cn('font-mono text-base font-semibold tracking-tight', textClassName)}>wrangl</span>
    </Link>
  );
};
