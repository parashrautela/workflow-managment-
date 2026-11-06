// frontend/src/components/SuggestReply.jsx
// AI-suggested reply for a client query, built from the project's recorded data.
// The suggestion is a preview; the founder chooses to use it, edits it, and still confirms before anything is sent.
import { useState } from 'react';
import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { suggestDecisionReply } from '@/lib/api';

// baseInstruction carries what the founder just decided (for example "Delayed Drawing by 3 days"), so the draft states it.
// outcome is a client-facing sentence of that decision; the draft leads with it, even without AI.
export function SuggestReply({ requestId, disabled, onUse, baseInstruction = '', outcome = '' }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [instruction, setInstruction] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setSuggestion(
        await suggestDecisionReply(
          requestId,
          [baseInstruction, instruction.trim()].filter(Boolean).join(' ').slice(0, 500),
          outcome,
        ),
      );
    } catch (problem) {
      setError(problem.message || 'Could not suggest a reply. Write it yourself or try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* While drafting, a quiet line replaces the button so finished drafts are what stand out. */}
        {busy ? (
          <span
            role="status"
            className="inline-flex min-h-8 items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Drafting from project data…
          </span>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={run}>
            <Sparkles className="size-3.5 mr-2" />
            {suggestion ? 'Suggest again' : 'Suggest reply'}
          </Button>
        )}
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowGuide((current) => !current)}
        >
          {showGuide ? 'Hide guidance' : 'Tell the AI what to say'}
        </button>
      </div>
      {showGuide && (
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={500}
          placeholder="e.g. Say the floor plan is a day late and we'll share it by Friday"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!busy && !disabled) run();
            }
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {/* The draft is shown as the message the group will read, with its actions underneath. */}
      {suggestion && (
        <article className="overflow-hidden rounded-xl border bg-card" aria-live="polite">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
            <span className="font-medium text-foreground">
              {suggestion.ai ? 'Suggested reply' : 'Draft from project records'}
            </span>
            <span>{suggestion.ai ? "· from this project's records" : '· AI not available'}</span>
            <span className="ml-auto">To the Telegram group</span>
          </header>
          <p className="whitespace-pre-wrap break-words px-4 pt-3 type-copy-14">
            {suggestion.suggestion}
          </p>
          <p className="px-4 pt-2 pb-3 text-xs text-muted-foreground">
            Based on {suggestion.basedOn.inProgress} in-progress, {suggestion.basedOn.late} late and{' '}
            {suggestion.basedOn.nextUp} upcoming work items
            {suggestion.basedOn.previousReplies
              ? `, ${suggestion.basedOn.previousReplies} earlier replies`
              : ''}
            {suggestion.basedOn.internalNotes
              ? ` and your ${suggestion.basedOn.internalNotes} internal note${suggestion.basedOn.internalNotes === 1 ? '' : 's'} (never quoted)`
              : ''}
            . Check it before sending.
          </p>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t bg-subtle px-3 py-2">
            <div className="flex flex-wrap gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={run}>
                <RefreshCw className="size-3.5 mr-1" />
                Try again
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                <X className="size-3.5 mr-1" />
                Discard
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onUse(suggestion.suggestion);
                setSuggestion(null);
              }}
            >
              <Check className="size-3.5 mr-1" />
              Use this reply
            </Button>
          </footer>
        </article>
      )}
    </div>
  );
}
