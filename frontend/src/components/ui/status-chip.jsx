import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-info-border bg-info-bg text-info',
  warning: 'border-warning-border bg-warning-bg text-warning',
  success: 'border-success-border bg-success-bg text-success',
  overdue: 'border-overdue-border bg-overdue-bg text-overdue',
};

// The one status chip. Pass a task status from lib/taskStatus, or a tone with its own words.
function StatusChip({ status, tone, children, className, ...props }) {
  return (
    <Badge
      variant="outline"
      data-slot="status-chip"
      className={cn(tones[tone ?? status?.tone] ?? tones.neutral, className)}
      {...props}
    >
      <span className="truncate">{children ?? status?.text}</span>
    </Badge>
  );
}

export { StatusChip };
