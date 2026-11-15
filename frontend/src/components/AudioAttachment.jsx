import { Mic } from 'lucide-react';

export const isAudioAttachment = (file) =>
  ['voice', 'audio'].includes(file.type) || /^audio\//.test(file.mimeType || '');

// preload="none": a 20 MB note is fetched from Telegram only when someone presses play.
export function AudioAttachment({ src, label }) {
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Mic className="size-3" />
        {label}
      </span>
      <audio controls preload="none" src={src} className="block h-10 w-72 max-w-full" />
    </div>
  );
}
