import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Button — shadcn/ui base adapted to the FaceStudio design system (SKILLS.md §B.9).
 * Focus uses an offset outline so it reads correctly on any surface.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,box-shadow] duration-[120ms] ease-fs',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-brand-solid text-white shadow-elev-1 hover:bg-brand-solid-hover active:bg-brand-solid-hover',
        secondary:
          'border border-line bg-surface-elevated text-fg hover:border-line-strong hover:bg-surface-hover active:bg-surface-pressed',
        outline: 'border border-line-strong bg-transparent text-fg hover:bg-surface-hover active:bg-surface-pressed',
        ghost: 'bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg active:bg-surface-pressed',
        destructive: 'bg-danger/90 text-white hover:bg-danger active:bg-danger',
        link: 'h-auto px-0 text-brand underline-offset-4 hover:text-brand-hover hover:underline',
      },
      size: {
        xs: 'h-6 gap-1 rounded-sm px-2 text-ui-sm [&_svg:not([class*=size-])]:size-3.5',
        sm: 'h-7 gap-1.5 px-2.5 text-ui',
        default: 'h-8 px-3 text-ui-lg',
        lg: 'h-10 px-5 text-sm',
        xl: 'h-12 px-6 text-base [&_svg:not([class*=size-])]:size-5',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-xs': 'size-6 rounded-sm [&_svg:not([class*=size-])]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Next.js `Link`) with button styles. */
    asChild?: boolean;
    /** Shows a spinner, sets `aria-busy`, and blocks interaction. Ignored with `asChild`. */
    loading?: boolean;
  };

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));

  if (asChild) {
    return (
      <Slot.Root data-slot="button" data-variant={variant} data-size={size} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants, type ButtonProps };
