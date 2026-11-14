import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'accent';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:brightness-110 shadow-sm shadow-primary/20',
  accent: 'bg-accent text-accent-foreground hover:brightness-105',
  secondary: 'bg-secondary text-secondary-foreground hover:brightness-95',
  outline: 'border border-border bg-transparent hover:bg-muted',
  ghost: 'bg-transparent hover:bg-muted',
  destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-md',
  md: 'h-11 px-4 text-sm rounded-md',
  lg: 'h-14 px-6 text-base rounded-lg',
  xl: 'h-16 px-8 text-lg rounded-xl',
};

export interface ButtonProps extends React.ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-[filter,background-color,opacity]',
        'disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
