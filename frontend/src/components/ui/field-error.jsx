import * as React from 'react';
import { cn } from '@/lib/utils';

export function FieldError({ className, children, ...props }) {
  if (!children) return null;
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn('text-xs text-destructive type-label-12 font-normal', className)}
      {...props}
    >
      {children}
    </p>
  );
}
