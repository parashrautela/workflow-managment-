import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The one Refresh button. The icon spins while the reload runs, and for at least a beat,
// so a reload that finishes instantly still reads as done instead of as a dead click.
function RefreshButton({ onRefresh, children = 'Refresh', className, ...props }) {
  const [busy, setBusy] = React.useState(false);
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await Promise.all([onRefresh(), new Promise((resolve) => setTimeout(resolve, 600))]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      aria-busy={busy}
      className={className}
      onClick={refresh}
      {...props}
    >
      <RefreshCw className={cn(busy && 'animate-spin')} aria-hidden="true" />
      {children}
    </Button>
  );
}

export { RefreshButton };
