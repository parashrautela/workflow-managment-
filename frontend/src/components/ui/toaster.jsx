import * as React from 'react';
import { Check, X } from 'lucide-react';

const listeners = new Set();
let nextId = 0;

// toast('Saved') or toast(error.message, { error: true }): one short message at the bottom of the
// screen, so a confirmation never lands somewhere the reader has to scroll to find.
export function toast(message, { error = false } = {}) {
  if (!message) return;
  const item = { id: nextId++, message, error };
  listeners.forEach((listener) => listener(item));
}

// Mounted once in main.jsx. Errors stay longer, because they take longer to read.
export function Toaster() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => {
    const show = (item) => {
      setItems((current) => [...current.slice(-2), item]);
      setTimeout(
        () => setItems((current) => current.filter((entry) => entry.id !== item.id)),
        item.error ? 6000 : 3500,
      );
    };
    listeners.add(show);
    return () => listeners.delete(show);
  }, []);
  if (!items.length) return null;
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-24 z-[60] flex max-w-sm flex-col gap-2 md:bottom-4"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role={item.error ? 'alert' : 'status'}
          className="rounded-lg border bg-card px-4 py-3 text-sm shadow-lg"
        >
          {item.error ? (
            <X className="mr-2 inline size-4 text-destructive" />
          ) : (
            <Check className="mr-2 inline size-4 text-success" />
          )}
          {item.message}
        </div>
      ))}
    </div>
  );
}
