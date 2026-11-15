import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const isAudioAttachment = (file) =>
  ['voice', 'audio'].includes(file.type) || /^audio\//.test(file.mimeType || '');

const clock = (seconds) => {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// A voice message: play or pause, a bar to drag, and how long it is. The recording is fetched
// when someone first presses play (so a 20 MB note costs nothing until it is wanted) and then
// played from memory, because the server cannot stream parts of a file and the browser's own
// player could not skip around in it.
export function AudioAttachment({ src, label }) {
  const audio = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  useEffect(
    () => () => {
      const url = audio.current?.src;
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    },
    [],
  );
  const toggle = async () => {
    const element = audio.current;
    if (status === 'loading') return;
    if (status === 'ready') return element.paused ? element.play() : element.pause();
    setStatus('loading');
    try {
      const response = await fetch(src, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('unavailable');
      element.src = URL.createObjectURL(await response.blob());
      setStatus('ready');
      await element.play();
    } catch {
      setStatus('error');
    }
  };
  const syncLength = () => {
    const seconds = audio.current?.duration;
    if (Number.isFinite(seconds)) setLength(seconds);
  };
  return (
    <div className="w-full max-w-sm space-y-1">
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Mic className="size-3" />
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-2">
        <Button
          size="icon"
          disabled={status === 'loading'}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          onClick={toggle}
        >
          {status === 'loading' ? (
            <Loader2 className="animate-spin" />
          ) : playing ? (
            <Pause className="fill-current" />
          ) : (
            <Play className="fill-current" />
          )}
        </Button>
        {status === 'error' ? (
          <p role="alert" className="min-w-0 flex-1 text-xs text-overdue">
            Could not play this voice message.{' '}
            <a className="underline" href={src} target="_blank" rel="noreferrer">
              Open it in a new tab
            </a>
          </p>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={length || 0}
              step="0.1"
              value={time}
              disabled={status !== 'ready' || !length}
              aria-label="Seek voice message"
              className="h-1 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-default"
              onChange={(event) => {
                audio.current.currentTime = Number(event.target.value);
                setTime(audio.current.currentTime);
              }}
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {clock(time)}
              {length ? ` / ${clock(length)}` : ''}
            </span>
          </>
        )}
      </div>
      <audio
        ref={audio}
        hidden
        onLoadedMetadata={syncLength}
        onDurationChange={syncLength}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setTime(0);
          setPlaying(false);
        }}
        onError={() => setStatus('error')}
      />
    </div>
  );
}
