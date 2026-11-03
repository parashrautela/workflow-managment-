import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm leading-label font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary-foreground',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:outline-white',
        'destructive-outline':
          'border border-overdue-border bg-background text-destructive shadow-xs hover:bg-overdue-bg hover:text-destructive',
        'destructive-ghost': 'text-destructive hover:bg-overdue-bg hover:text-destructive',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Heights: 36 and 32 on desktop, 44 on phones. One shape, set above.
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3 max-sm:min-h-11',
        sm: 'h-8 gap-2 px-3 has-[>svg]:px-2 max-sm:min-h-11',
        icon: 'size-9 max-sm:size-11',
        'icon-sm': 'size-8 max-sm:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
