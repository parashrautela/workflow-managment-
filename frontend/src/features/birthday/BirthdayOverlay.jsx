import { useEffect, useRef, useState } from 'react';
import { request } from '@/lib/api';
import './birthday.css';

// Rays from Figma "Frame 1" (388:1228, a 1440 x 919 canvas): tallest at the edges, stepping down toward
// the text. Each is a soft #0f9 glow plus a gradient bar; the left-edge pair is offset in the design.
const RAYS = [
  { x: 91, y: 249, gx: 101, gy: 230, delay: 0 },
  { x: 1341, y: 269, delay: 120 },
  { x: 263, y: 377, delay: 260 },
  { x: 1209, y: 352, delay: 380 },
  { x: 401, y: 518, delay: 520 },
  { x: 1089, y: 480, delay: 640 },
];
const LEAVE_MS = 900;
// ElevenLabs voice pre-mixed over Polarizer: music ducked under the voice, swelling up once it ends.
const AUDIO_URL = '/assets/birthday/birthday-music.mp3';
// music badge bars from the Figma export (x, top, bottom); drawn inline so they can move with the music
const BARS = [[20, 26, 56], [27, 29, 52], [35, 30, 52], [43, 26, 56], [51, 30, 52], [59, 27, 55], [67, 24, 58], [75, 30, 51]];

// Safari won't play media from a server without range requests, so play downloaded blobs instead.
const blobUrl = (url) =>
  fetch(url)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(url))))
    .then((blob) => URL.createObjectURL(blob));

function Layered({ className, children }) {
  return (
    <span className={className}>
      <span className="bday-glow" aria-hidden="true">{children}</span>
      <span className="bday-face">{children}</span>
    </span>
  );
}

// The server decides who sees it (BIRTHDAY_EMAILS) and sends the name; ?birthday replays it for a listed account.
export function BirthdayOverlay() {
  const [name, setName] = useState('');
  useEffect(() => {
    const replay = new URLSearchParams(window.location.search).has('birthday');
    request(`/api/birthday${replay ? '?replay=1' : ''}`)
      .then((data) => setName(data.name || ''))
      .catch(() => {});
  }, []);
  return name ? <BirthdaySequence name={name} /> : null;
}

function BirthdaySequence({ name }) {
  const [state, setState] = useState('open');
  const button = useRef(null);
  const player = useRef(null);
  const [sound, setSound] = useState(false);
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    let alive = true;
    let url;
    const fallback = setTimeout(() => setRunning(true), 4000); // slow network: don't hold the black screen for long
    blobUrl(AUDIO_URL)
      .then((loaded) => {
        url = loaded;
        if (!alive) return URL.revokeObjectURL(url);
        const audio = new Audio(url);
        audio.onplay = () => setSound(true);
        audio.onpause = () => setSound(false);
        audio.addEventListener('playing', () => setRunning(true), { once: true });
        player.current = audio;
        return audio.play(); // browsers may block sound until a click; the badge starts it then
      })
      .catch(() => setRunning(true));
    return () => {
      alive = false;
      clearTimeout(fallback);
      player.current?.pause();
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (running) startedAt.current = performance.now();
  }, [running]);

  // A late first tap (sound was blocked) joins the track where the screen already is, so it stays in sync.
  const toggleSound = () => {
    const audio = player.current;
    if (!audio) return;
    if (sound) return audio.pause();
    if (audio.currentTime === 0 && startedAt.current) audio.currentTime = (performance.now() - startedAt.current) / 1000;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    if (state !== 'open') return undefined;
    button.current?.focus({ preventScroll: true });
    const onKey = (event) => event.key === 'Escape' && setState('leaving');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  useEffect(() => {
    if (state !== 'leaving') return undefined;
    request('/api/birthday/seen', { method: 'POST' }).catch(() => {});
    const audio = player.current;
    const from = audio?.volume ?? 0;
    let tick = 0;
    const fade = setInterval(() => {
      tick += 1;
      if (audio) audio.volume = Math.max(0, from * (1 - tick / 18));
    }, LEAVE_MS / 18);
    const timer = setTimeout(() => setState('closed'), LEAVE_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(fade);
    };
  }, [state]);

  if (state === 'closed') return null;

  return (
    <div
      className={`bday${running ? ' is-running' : ''}${state === 'leaving' ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bday-title"
    >
      <div className="bday-veil" />
      <div className="bday-sky" aria-hidden="true">
        {RAYS.map((ray, index) => (
          <span key={index} style={{ '--d': `${ray.delay}ms` }}>
            <i className="bday-ray bday-ray-solid" style={{ left: `${ray.x / 14.4}vw`, top: `${ray.y / 9.19}vh` }} />
            <i className="bday-ray bday-ray-curtain" style={{ left: `${(ray.gx ?? ray.x) / 14.4}vw`, top: `${(ray.gy ?? ray.y) / 9.19}vh` }} />
          </span>
        ))}
        <i className="bday-pool bday-pool-left" />
        <i className="bday-pool bday-pool-right" />
      </div>
      <div className="bday-black" />
      <div className="bday-stars" aria-hidden="true" />

      <button
        type="button"
        className={`bday-music${sound ? '' : ' is-off'}`}
        aria-label={sound ? 'Pause birthday music' : 'Play birthday music'}
        title={sound ? 'Pause music' : 'Play music'}
        onClick={toggleSound}
      >
        <svg width="94" height="82" viewBox="0 0 94 82" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="bday-badge-edge" x1="47" y1="82" x2="47" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#373636" />
              <stop offset="1" stopColor="#B1B1B1" />
            </linearGradient>
            {BARS.map(([x, top, bottom], i) => (
              <linearGradient key={i} id={`bday-bar-${i}`} x1={x + 0.5} y1={bottom} x2={x + 0.5} y2={top} gradientUnits="userSpaceOnUse">
                <stop stopColor="#7F7F7F" />
                <stop offset="1" stopColor="#B1B1B1" />
              </linearGradient>
            ))}
          </defs>
          <rect x="0.5" y="0.5" width="93" height="81" fill="white" fillOpacity="0.1" stroke="url(#bday-badge-edge)" />
          {BARS.map(([x, top, bottom], i) => (
            <path key={i} className="bday-bar" d={`M${x} ${top}V${bottom}`} stroke={`url(#bday-bar-${i})`} style={{ '--i': i }} />
          ))}
        </svg>
      </button>

      <div className="bday-content">
        <p className="bday-date">It’s 27 November</p>
        <h2 id="bday-title" className="bday-title">
          <Layered className="bday-line bday-line-1">Happy Birthday</Layered>
          <Layered className="bday-line bday-line-2">{name}</Layered>
        </h2>
        <p className="bday-note">
          <Layered className="bday-line bday-note-line">Approval pending: another year of being the nicest person on every call.</Layered>
          <Layered className="bday-line bday-note-line bday-note-punch">We’ve already approved it.</Layered>
        </p>
        <button ref={button} type="button" className="bday-leave" onClick={() => setState('leaving')}>
          <span>Enough celebration, let’s get </span>
          <span className="bday-leave-link">Back to work→</span>
        </button>
      </div>
    </div>
  );
}
