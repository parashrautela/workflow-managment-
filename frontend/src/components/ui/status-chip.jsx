import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// The tone lives in the dot; the chip itself is a quiet white pill, so a list of late work stays calm.
const dots = {
  neutral: 'bg-border-strong',
  info: 'bg-info-fill',
  warning: 'bg-warning-fill',
  success: 'bg-success-fill',
  overdue: 'bg-overdue-fill',
};

// The one status chip. Pass a task status from lib/taskStatus, or a tone with its own words.
// action: the item is waiting on the reader and its row opens it, so the chip ends in a chevron.
function StatusChip({ status, tone, action = false, children, className, ...props }) {
  const key = tone ?? status?.tone;
  return (
    <Badge
      variant="outline"
      data-slot="status-chip"
      className={cn(
        'border-border bg-card font-normal text-foreground shadow-[var(--shadow-pill)]',
        className,
      )}
      {...props}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dots[key] ?? dots.neutral)} />
      <span className="truncate">{children ?? status?.text}</span>
      {action && <ChevronRight aria-hidden="true" />}
    </Badge>
  );
}

export { StatusChip };
