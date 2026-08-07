import React from 'react';
import { cn } from '../../lib/utils';
import { STACK_SPACING, StackSpacing } from '../../styles/tokens';

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: StackSpacing;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
  children?: React.ReactNode;
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(({
  spacing = 'md',
  align,
  justify,
  className,
  children,
  ...props
}, ref) => {
  const alignClasses = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  };

  const justifyClasses = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col",
        STACK_SPACING[spacing],
        align && alignClasses[align],
        justify && justifyClasses[justify],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Stack.displayName = 'Stack';
