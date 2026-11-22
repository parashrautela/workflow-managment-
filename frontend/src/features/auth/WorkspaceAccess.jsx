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

export function WorkspaceAccess({ children }) {
  return (
    <main className="iksha-access">
      {/* Sky photo with a glimpse of the workspace. Decoration only. */}
      <div className="iksha-access-art" aria-hidden="true">
        <img className="iksha-access-sky" src="/assets/sign-in-sky.jpg" alt="" />
        <div className="iksha-access-shot">
          <div>
            <img src="/assets/sign-in-app.png" alt="" />
          </div>
        </div>
      </div>

      <section className="iksha-access-panel">
        <div className="iksha-access-intro">
          <img src="/assets/sign-in-logo.svg" alt="" width="53" height="53" />
          <h1>Keep every project moving from design to handover.</h1>
          <p>Timelines, tasks, site updates, approvals and client questions, in one workspace.</p>
        </div>

        <div className="iksha-access-actions">
          <div>
            {children}
            <GoogleSignIn />
          </div>
          <a href="/privacy">Privacy</a>
        </div>
      </section>
    </main>
  );
}
