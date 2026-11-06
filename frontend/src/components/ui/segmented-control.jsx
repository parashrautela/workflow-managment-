import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

// One choice from a short visible set: filters, zoom levels, view modes.
// Use the shared select instead when the options are long or come from data.
function SegmentedControl({ label, value, onValueChange, options, className }) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix sends an empty value when the active item is pressed again. One option stays chosen.
      onValueChange={(next) => next && onValueChange(next)}
      data-slot="segmented-control"
      className={cn(
        'inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full bg-subtle p-1',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          data-slot="segmented-control-item"
          className="inline-flex min-h-8 items-center justify-center gap-2 rounded-full px-3 text-xs font-medium text-secondary-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[var(--shadow-pill)] max-sm:min-h-11 [&_svg]:size-3.5 [&_svg]:shrink-0"
        >
          {option.icon}
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

export { SegmentedControl };
