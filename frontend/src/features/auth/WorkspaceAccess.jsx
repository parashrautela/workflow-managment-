import { useRef } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import { GoogleSignIn } from './GoogleSignIn';
import './workspace-access.css';

export function IkshaBrand({ compact = false }) {
  return (
    <div className={`iksha-wordmark ${compact ? 'compact' : ''}`}>
      iksha<span>.</span>
      {!compact && <small>SPACES, THOUGHTFULLY MADE</small>}
    </div>
  );
}

const ARCHES = [
  { turn: -66, scale: 0.86 },
  { turn: -31, scale: 1 },
  { turn: 4, scale: 0.96 },
  { turn: 39, scale: 0.84 },
];

// A fan of glass arched windows. Decorative only, so it stays hidden from screen readers.
function GlassArches() {
  return (
    <div className="iksha-glass" aria-hidden="true">
      {ARCHES.map(({ turn, scale }, index) => (
        <span
          key={turn}
          className="iksha-glass-arch"
          style={{ '--turn': `${turn}deg`, '--scale': scale, '--delay': `${index * 0.09}s` }}
        />
      ))}
      <span className="iksha-glass-base" />
    </div>
  );
}

export function WorkspaceAccess({ team = false, children }) {
  const page = useRef(null);
  // The glass catches the light as the pointer moves. CSS ignores this when motion is reduced.
  const followPointer = (event) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    page.current?.style.setProperty('--pointer-x', x.toFixed(3));
    page.current?.style.setProperty('--pointer-y', y.toFixed(3));
  };
  return (
    <main className="iksha-access" ref={page} onPointerMove={followPointer}>
      <div className="iksha-access-card">
        <section className="iksha-access-form">
          <header className="iksha-access-top">
            <IkshaBrand compact />
            <span className="iksha-access-tag">
              <LockKeyhole aria-hidden="true" />
              Private workspace
            </span>
          </header>

          <div className="iksha-access-body">
            <span className="iksha-access-icon" aria-hidden="true">
              <span>
                <UserRound />
              </span>
            </span>
            <h1>Welcome back</h1>
            <p>Use your Google account to enter your workspace.</p>
            {children}
            <GoogleSignIn />
          </div>

          <footer className="iksha-access-foot">
            <span>© {new Date().getFullYear()} Studio Iksha</span>
            <a href="/privacy">Privacy</a>
          </footer>
        </section>

        <section className="iksha-access-story">
          <svg className="iksha-access-grain" aria-hidden="true" focusable="false">
            <filter id="access-grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#access-grain)" />
          </svg>
          <GlassArches />

          <div className="iksha-access-brand">
            <span className="iksha-access-tile" aria-hidden="true">
              <span>
                i<i>.</i>
              </span>
            </span>
            <h2>Studio Iksha</h2>
            <p>
              Thoughtful spaces. <span>Connected people.</span>
            </p>
          </div>

          <dl className="iksha-access-notes">
            <div>
              <dt>Get access</dt>
              <dd>Ask a founder to add your Google email.</dd>
            </div>
            <div>
              <dt>For clients</dt>
              <dd>Project updates continue in Telegram.</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
