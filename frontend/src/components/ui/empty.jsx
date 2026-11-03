import * as React from 'react';
import { cn } from '@/lib/utils';

// The one empty state.
// first-use: nothing exists yet. Say what will appear here and how it gets here.
// no-results: things exist, but a search or filter hides them. Offer a way back.
function Empty({ kind = 'first-use', icon: Icon, title, description, action, className }) {
  return (
    <div
      data-slot="empty"
      data-kind={kind}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border px-4 py-8 text-center',
        kind === 'no-results' ? 'border-dashed' : 'bg-card',
        className,
      )}
    >
      {Icon && (
        <span className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <h3 className="type-label-14-strong text-foreground">{title}</h3>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export { Empty };
