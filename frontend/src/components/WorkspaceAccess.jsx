import {GoogleSignIn} from './GoogleSignIn';
export function IkshaBrand({ compact = false }) {
  return <div className={`iksha-wordmark ${compact ? 'compact' : ''}`}>iksha<span>.</span>{!compact && <small>SPACES, THOUGHTFULLY MADE</small>}</div>;
}

export function WorkspaceAccess({ team = false, children }) {
  return <main className="iksha-access"><section className="iksha-access-story"><IkshaBrand /><div><p className="iksha-eyebrow">THE STUDIO, IN SYNC</p><h2>Thoughtful spaces.<br />Connected people.</h2><p>From the first client brief to the final detail.<br />One place for the work that brings it all together.</p></div><small>STUDIO IKSHA / PROJECT WORKSPACE</small></section><section className="iksha-access-form"><p className="iksha-eyebrow">{team ? 'TEAM ACCESS' : 'FOUNDER ACCESS'}</p><h1>Welcome back.</h1><p>Sign in to move the work forward.</p>{children}<GoogleSignIn/><p className="iksha-access-note">Clients continue to communicate through Telegram.</p><a className="iksha-access-link" href={team ? '/' : '/employee'}>{team ? 'Founder sign-in' : 'Team member sign-in'} →</a></section></main>;
}
