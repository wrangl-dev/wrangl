import React from 'react';
import { cn } from '../../lib/utils';

type ButtonOwnProps<E extends React.ElementType> = {
  variant?: 'primary' | 'secondary' | 'dark' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  as?: E;
};

export type ButtonProps<E extends React.ElementType = 'button'> =
  ButtonOwnProps<E> &
  Omit<React.ComponentPropsWithRef<E>, keyof ButtonOwnProps<E>>;

type ButtonComponent = (<E extends React.ElementType = 'button'>(
  props: ButtonProps<E> & { ref?: React.ComponentPropsWithRef<E>['ref'] }
) => React.ReactElement | null) & {
  displayName?: string;
};

const renderButton = <E extends React.ElementType = 'button'>(
  { className, variant = 'primary', size = 'md', as, children, ...props }: ButtonProps<E>,
  ref: React.ComponentPropsWithRef<E>['ref']
) => {
    const Component = as ?? 'button';
    const componentProps = Component === 'button' ? { type: 'button', ...props } : props;

    return (
      <Component
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-sm border font-mono font-medium whitespace-nowrap",
          "transition-[transform,color,background-color,border-color] duration-150 ease-[var(--ease-out)]",
          "active:translate-y-px",

          variant === 'primary' && "border-white bg-white text-ink hover:bg-light-steel hover:border-light-steel",
          variant === 'secondary' && "border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10",
          variant === 'dark' && "border-white/20 bg-transparent text-white hover:border-white/60 hover:bg-white/10",
          variant === 'outline' && "border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10",

          size === 'sm' && "px-4 py-2 text-sm",
          size === 'md' && "px-5 py-3 text-base",
          size === 'lg' && "px-6 py-3.5 text-base",

          className
        )}
        {...componentProps}
      >
        {children}
      </Component>
    );
};

export const Button = React.forwardRef(
  renderButton as unknown as React.ForwardRefRenderFunction<
    unknown,
    ButtonProps<React.ElementType>
  >
) as ButtonComponent;

Button.displayName = 'Button';
