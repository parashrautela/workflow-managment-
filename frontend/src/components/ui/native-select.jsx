import * as React from 'react';
import { cn } from '@/lib/utils';

// variant="pill": a quiet white pill for filters that sit beside a segmented control.
function NativeSelect({ className, size = 'default', variant = 'default', ...props }) {
  return (
    <select
      data-slot="native-select"
      data-size={size}
      data-variant={variant}
      className={cn(
        'h-9 w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card px-3 py-2 pr-8 text-sm shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8 data-[size=sm]:py-1',
        'focus-visible:border-ring',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

function NativeSelectOption({ className, ...props }) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
