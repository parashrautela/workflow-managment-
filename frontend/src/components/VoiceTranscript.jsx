import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transcribeVoiceNote } from '@/lib/api';

// Under a voice message: the words that were said, in the language they were said in. It says it is AI
// and may be wrong, because the recording stays the source of truth. When the studio has opted in, a
// founder can ask for a transcript that did not arrive on its own.
export function VoiceTranscript({ requestId, index, transcript, canTranscribe }) {
  const [fetched, setFetched] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const text = transcript?.text || fetched;
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setFetched((await transcribeVoiceNote(requestId, index)).transcript.text);
    } catch (problem) {
      setError(problem.message || 'Could not transcribe this voice note.');
    } finally {
      setBusy(false);
    }
  };
  if (text)
    return (
      <div className="w-full max-w-lg space-y-1 rounded-xl border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">AI transcript · may contain mistakes</p>
        <p className="whitespace-pre-wrap text-sm">{text}</p>
      </div>
    );
  if (!canTranscribe) return null;
  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" disabled={busy} onClick={run}>
        {busy ? <Loader2 className="animate-spin" /> : <FileText />}
        Transcribe
      </Button>
      {error && (
        <p role="alert" className="text-xs text-overdue">
          {error}
        </p>
      )}
    </div>
  );
}
