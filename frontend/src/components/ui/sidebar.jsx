import * as React from 'react';
import { cn } from '@/lib/utils';

// Sidebar parts in the shadcn style: a group, its label, and rows of one fixed height: 32px on desktop, 44px on touch layouts.
function SidebarGroup({ className, ...props }) {
  return <div data-slot="sidebar-group" className={cn('grid gap-1', className)} {...props} />;
}

function SidebarGroupLabel({ className, children, count, ...props }) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'flex h-6 items-center justify-between px-2 text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {count != null && <span className="tabular-nums">{count}</span>}
    </div>
  );
}

function SidebarItem({
  active = false,
  icon: Icon,
  badge,
  dot,
  className,
  children,
  title,
  ...props
}) {
  return (
    <button
      type="button"
      data-slot="sidebar-item"
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      title={title}
      className={cn(
        'flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-transparent px-2 text-left text-sm text-foreground transition-colors hover:bg-card data-[active=true]:border-border data-[active=true]:bg-card data-[active=true]:font-semibold',
        'lg:h-8',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-warning-bg px-1 text-xs font-medium text-warning tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

export { SidebarGroup, SidebarGroupLabel, SidebarItem };
