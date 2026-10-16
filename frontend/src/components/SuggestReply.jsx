// frontend/src/components/SuggestReply.jsx
// AI-suggested reply for a client query, built from the project's recorded data.
// The suggestion is a preview; the founder chooses to use it, edits it, and still confirms before anything is sent.
import { useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestDecisionReply } from "@/lib/api";

export function SuggestReply({ requestId, disabled, onUse }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true); setError("");
    try {
      setSuggestion(await suggestDecisionReply(requestId, instruction.trim()));
    } catch (problem) {
      setError(problem.message || "Could not suggest a reply. Write it yourself or try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="text-xs border-primary/30 text-primary" disabled={disabled || busy} onClick={run}>
          {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Sparkles className="size-3.5 mr-1.5" />}
          {busy ? "Drafting from project data…" : suggestion ? "Suggest again" : "Suggest reply"}
        </Button>
        <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowGuide((current) => !current)}>
          {showGuide ? "Hide guidance" : "Tell the AI what to say"}
        </button>
      </div>
      {showGuide && (
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={500}
          placeholder="e.g. Say the floor plan is a day late and we'll share it by Friday"
          className="text-xs"
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!busy && !disabled) run(); } }}
        />
      )}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
      {suggestion && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2" aria-live="polite">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3.5" />
            {suggestion.ai ? "Suggested reply · from this project's records" : "Draft from project records (AI not available)"}
          </p>
          <p className="whitespace-pre-wrap break-words text-xs text-foreground">{suggestion.suggestion}</p>
          <p className="text-[10px] text-muted-foreground">
            Based on {suggestion.basedOn.inProgress} in-progress, {suggestion.basedOn.late} late and {suggestion.basedOn.nextUp} upcoming work items
            {suggestion.basedOn.previousReplies ? `, ${suggestion.basedOn.previousReplies} earlier replies` : ""}
            {suggestion.basedOn.internalNotes ? ` and your ${suggestion.basedOn.internalNotes} internal note${suggestion.basedOn.internalNotes === 1 ? "" : "s"} (never quoted)` : ""}. Check it before sending.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="text-xs" onClick={() => { onUse(suggestion.suggestion); setSuggestion(null); }}>
              <Check className="size-3.5 mr-1" />Use this reply
            </Button>
            <Button type="button" size="sm" variant="outline" className="text-xs" disabled={busy} onClick={run}>
              <RefreshCw className="size-3.5 mr-1" />Try again
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={() => setSuggestion(null)}>
              <X className="size-3.5 mr-1" />Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
