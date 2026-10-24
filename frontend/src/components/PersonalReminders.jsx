import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { request } from '@/lib/api';

export function PersonalReminders({ connections, onChanged }) {
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const run = async (action) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  };
  const showLink = () => run(async () => {
    const data = await request('/api/founder/personal-connection');
    setLink(data.link);
  });
  const showPreview = (employeeId) => run(async () => {
    setPreview(null);
    setPreview(await request(`/api/founder/personal-reminder?employeeId=${encodeURIComponent(employeeId)}`));
  });
  const send = () => run(async () => {
    const data = await request('/api/founder/personal-reminder', { method: 'POST', body: { employeeId: preview.employeeId, text: preview.text } });
    setPreview(null);
    setNotice(data.empty ? 'No actionable work today; no message sent.' : data.delivery.status === 'Sent' ? 'Today’s reminder was sent. The scheduled run will not send it again today.' : 'Delivery is uncertain. Check the employee’s Telegram chat before taking any further action.');
    await onChanged();
  });
  return <div className="space-y-3 border-t pt-3">
    <p className="text-sm font-medium">Connect site admins and test their reminders</p>
    <p className="text-xs text-muted-foreground">Share this bot link in the project Telegram group or directly with the site admin. They open it and press Start from their own account. They do not need to sign in to the web app. Assign their Telegram profile to the project first.</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={showLink}>Get bot link to share</Button><Button variant="outline" disabled={busy} onClick={() => run(onChanged)}>Refresh connections</Button></div>
    {link && <div className="space-y-2 rounded-lg border p-3"><p className="break-all text-sm"><a className="underline" href={link} target="_blank" rel="noreferrer">{link}</a></p><Button variant="outline" size="sm" disabled={busy} onClick={() => run(async () => { await navigator.clipboard.writeText(link); setNotice('Bot link copied. Share it with the site admin.'); })}>Copy bot link</Button><p className="text-xs text-muted-foreground">If copying is unavailable, select and copy the link above.</p></div>}
    {connections.map(person => <div key={person.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="text-sm font-medium">{person.name}</p><p className="text-xs text-muted-foreground">{person.connected ? 'Telegram connected' : person.hasTelegramProfile ? 'Waiting for Start in bot' : 'Assign their Telegram profile in the project team first'}</p></div><Button variant="outline" size="sm" disabled={busy || !person.hasTelegramProfile} onClick={() => showPreview(person.employeeId)}>Preview today’s reminder</Button></div>)}
    {!connections.length && <p className="text-xs text-muted-foreground">No active employees yet. Assign the site admin’s role in the project team.</p>}
    {preview && <div className="space-y-3 rounded-lg border p-3"><p className="text-sm font-medium">{preview.name} · {preview.taskCount} actionable {preview.taskCount === 1 ? 'task' : 'tasks'}</p><label className="grid gap-2 text-sm font-medium">Message to {preview.name}<Textarea value={preview.text} onChange={event => setPreview({...preview, text:event.target.value})} disabled={busy || Boolean(preview.delivery)} maxLength={12000} rows={7} className="min-h-40" placeholder="Write a personal reminder…"/></label><p className="text-xs text-muted-foreground">{preview.delivery ? 'This is the message recorded for today’s delivery.' : 'Edit this message before sending. Your edits apply to this send only.'}</p>{!preview.taskCount && <p className="text-xs text-muted-foreground">No actionable work today. You can write a reminder here to send manually.</p>}{preview.text.length > 12000 && <p role="alert" className="text-sm text-destructive">Shorten the message to 12,000 characters before sending.</p>}{!preview.connected && <p className="text-xs text-muted-foreground">Ask this person to press Start in the bot, then refresh their preview.</p>}{preview.delivery && <p className="text-xs">Today’s delivery: {preview.delivery.status}. {preview.delivery.error || 'A daily reminder has already been attempted; another will not be sent.'}</p>}<Button disabled={busy || !preview.connected || !preview.text.trim() || preview.text.length > 12000 || Boolean(preview.delivery)} onClick={send}>Send reminder to {preview.name}</Button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </div>;
}
