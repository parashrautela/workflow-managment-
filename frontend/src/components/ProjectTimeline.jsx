import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Hourglass, Octagon, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { calendarDate, calendarDay as DAY, timelineItems } from '@/lib/timeline';
import { canMove, itemStatus, moveFor, scheduleSummary, swapMoves, todayDate, undoMoves, unscheduledReason } from '@/lib/timelineStatus';
import { TimelineStageDetails } from '@/components/TimelineStageDetails';

const dateLabel = (value) => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
const isoLabel = (value) => (value ? dateLabel(calendarDate(value)) : 'no date');
const ZOOMS = [{ days: 14, label: '2 weeks', width: 82 }, { days: 42, label: '6 weeks', width: 40 }, { days: 91, label: '3 months', width: 20 }];
const STATUS_ICON = { late: AlertTriangle, blocked: Octagon, waiting: Hourglass, complete: Check };

export function ProjectTimeline({ tasks = [], stages = [], members = [], projectId, namespace = 'founder', onOpenTask, onSchedulePreview, onScheduleApply }) {
  const today = todayDate();
  const items = timelineItems(tasks, stages);
  const scheduled = items.filter((item) => item.start !== null && item.end !== null);
  const summary = scheduleSummary(items, today);
  const editable = Boolean(onSchedulePreview && onScheduleApply);
  // Open around today: one week of context behind, the coming weeks ahead.
  const [origin, setOrigin] = useState(today - 7 * DAY);
  const [days, setDays] = useState(42);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [selectedStageId, setSelectedStageId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [notice, setNotice] = useState(null);
  const dragRef = useRef(null);

  const from = origin, to = origin + days * DAY;
  const dayWidth = ZOOMS.find((zoom) => zoom.days === days)?.width ?? Math.max(8, 1120 / days);
  const compactHeader = dayWidth < 40;
  const allGroups = [...stages, { id: 'other', name: 'Additional work' }].filter((stage) => items.some((item) => (item.stage?.id || 'other') === stage.id));
  const ownerName = (task) => members.find((member) => (member.employeeId || member.id) === task.assigneeId)?.name || (task.assigneeId === 'founder' ? 'Founder' : task.assigneeName || 'Unassigned');
  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => `${item.task.title} ${item.stage?.name || 'Additional work'} ${ownerName(item.task)}`.toLowerCase().includes(query));
  const undated = visible.filter((item) => (item.start === null || item.end === null) && item.task.status !== 'Completed');
  const complete = (task) => ['Completed', 'completed'].includes(task.status);
  const toggle = (id) => setCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const todayInView = today >= from && today < to;

  async function propose(moves, description) {
    setProposal({ moves, description, loading: true });
    try {
      const preview = await onSchedulePreview(moves);
      setProposal({ moves, description, preview });
    } catch (error) {
      setProposal({ moves, description, error: error.message || 'Could not check this change.' });
    }
  }
  async function confirm() {
    const { moves, description } = proposal;
    setProposal({ ...proposal, saving: true });
    try {
      const result = await onScheduleApply(moves);
      setProposal(null);
      const pushed = result.affected.filter((item) => !item.moved).length;
      setNotice({ text: `${description} saved to the Google Sheet${pushed ? ` · ${pushed} dependent task${pushed === 1 ? '' : 's'} moved` : ''}.`, undo: undoMoves(result.affected) });
    } catch (error) {
      setProposal({ ...proposal, saving: false, error: error.message || 'Could not save this change.' });
    }
  }
  async function undo() {
    const moves = notice.undo;
    setNotice({ text: 'Undoing…' });
    try {
      await onScheduleApply(moves);
      setNotice({ text: 'Change undone. The Google Sheet is back to the earlier dates.' });
    } catch (error) {
      setNotice({ text: `Could not undo: ${error.message}` });
    }
  }

  // Calendar-style editing: drag to move, pull the right edge to resize, drop on another task to swap.
  function beginDrag(event, item) {
    if (!editable || !canMove(item) || event.button !== 0) return;
    const mode = event.target.closest('.iksha-resize-handle') ? 'resize' : 'move';
    dragRef.current = { id: item.task.id, item, mode, x: event.clientX, y: event.clientY, shift: 0, target: null, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event) {
    const current = dragRef.current;
    if (!current) return;
    if (!current.moved && Math.abs(event.clientX - current.x) < 5 && Math.abs(event.clientY - current.y) < 8) return;
    current.moved = true;
    current.shift = Math.round((event.clientX - current.x) / dayWidth);
    if (current.mode === 'resize') current.shift = Math.max(current.shift, -Math.round((current.item.end - current.item.start) / DAY) + 1);
    const row = document.elementsFromPoint(event.clientX, event.clientY).map((element) => element.closest?.('[data-task-row]')).find(Boolean);
    const target = row && row.dataset.taskRow !== current.id && current.mode === 'move' ? items.find((candidate) => candidate.task.id === row.dataset.taskRow) : null;
    current.target = target && canMove(target) ? target : null;
    setDrag({ ...current });
  }
  function endDrag(item) {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    if (!current.moved) { onOpenTask(item.task); return; }
    if (current.target) return void propose(swapMoves(current.item, current.target), `Swap “${current.item.task.title}” with “${current.target.task.title}”`);
    if (!current.shift) return;
    const moves = [current.mode === 'resize' ? moveFor(current.item, 0, current.shift) : moveFor(current.item, current.shift)];
    propose(moves, current.mode === 'resize' ? `Change the length of “${item.task.title}”` : `Move “${item.task.title}”`);
  }
  // Keyboard alternative: Alt+Arrow moves a day, Alt+Shift+Arrow changes the length.
  function keyMove(event, item) {
    if (!editable || !canMove(item) || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    propose([event.shiftKey ? moveFor(item, 0, step) : moveFor(item, step)], event.shiftKey ? `Change the length of “${item.task.title}”` : `Move “${item.task.title}”`);
  }

  const headline = [
    summary.late && `${summary.late} late`,
    summary.blocked && `${summary.blocked} blocked`,
    summary.waiting && `${summary.waiting} waiting on you`,
  ].filter(Boolean);

  return <div className="iksha-timeline">
    <div className="iksha-timeline-heading">
      <div>
        <p className="iksha-eyebrow">PROJECT SCHEDULE</p>
        <h2>{headline.length ? headline.join(' · ') : 'Nothing late or blocked'}</h2>
        <p>{summary.finish !== null ? `Projected finish ${dateLabel(summary.finish)}` : 'Finish date not confirmed'}{summary.unscheduled ? ` · ${summary.unscheduled} work item${summary.unscheduled === 1 ? '' : 's'} without dates` : ''}</p>
      </div>
      <span><CalendarDays size={14} />{scheduled.length} scheduled · {items.length - scheduled.length} without dates</span>
    </div>

    <div className="iksha-timeline-toolbar">
      <div className="iksha-date-nav">
        <Button variant="ghost" size="icon-sm" aria-label="Previous period" onClick={() => setOrigin(from - Math.max(7, Math.round(days / 2)) * DAY)}><ArrowLeft /></Button>
        <strong>{dateLabel(from)}{new Date(from).getUTCFullYear() !== new Date(to - DAY).getUTCFullYear() ? ', ' + new Date(from).getUTCFullYear() : ''} – {dateLabel(to - DAY)}, {new Date(to - DAY).getUTCFullYear()}</strong>
        <Button variant="ghost" size="icon-sm" aria-label="Next period" onClick={() => setOrigin(from + Math.max(7, Math.round(days / 2)) * DAY)}><ArrowRight /></Button>
      </div>
      <Button variant="outline" size="sm" onClick={() => setOrigin(today - 7 * DAY)}>Today</Button>
      <div className="iksha-zoom">{ZOOMS.map((zoom) => <button key={zoom.days} aria-pressed={days === zoom.days} className={days === zoom.days ? 'active' : ''} onClick={() => setDays(zoom.days)}>{zoom.label}</button>)}</div>
      {scheduled.length > 0 && <Button variant="outline" size="sm" aria-pressed={!ZOOMS.some((zoom) => zoom.days === days)} onClick={() => { const first = Math.min(...scheduled.map((item) => item.start)); setOrigin(first); setDays(Math.max(28, Math.ceil((Math.max(...scheduled.map((item) => item.end)) - first) / DAY))); }}>Entire plan</Button>}
      <Button variant="outline" size="sm" onClick={() => setCollapsed(allGroups.some((stage) => collapsed.has(stage.id)) ? new Set() : new Set(allGroups.map((stage) => stage.id)))}>{allGroups.some((stage) => collapsed.has(stage.id)) ? 'Expand stages' : 'Collapse stages'}</Button>
    </div>

    <label className="iksha-timeline-search"><span className="sr-only">Search timeline tasks</span><input placeholder="Find a work item or person…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>

    {notice && <div className="iksha-schedule-notice" role="status"><span>{notice.text}</span>{notice.undo?.length > 0 && <Button variant="outline" size="sm" onClick={undo}><Undo2 />Undo</Button>}<button className="iksha-notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

    {!items.length ? <div className="iksha-timeline-empty"><CalendarDays size={28} /><h3>No work items yet.</h3><p>Choose a project workflow to generate its tasks and schedule.</p></div> : <div className="iksha-schedule-scroll">
      <div style={{ '--timeline-width': `${days * dayWidth}px`, '--timeline-day': `${dayWidth}px`, '--today-left': `${(today - from) / DAY * dayWidth}px` }} className={`iksha-schedule-grid ${compactHeader ? 'iksha-plan-fit' : ''} ${todayInView ? 'has-today' : ''}`}>
        <div className="iksha-schedule-row iksha-schedule-head">
          <div className="iksha-schedule-label">STAGE / WORK ITEM</div>
          <div className="iksha-schedule-track iksha-schedule-dates">
            {todayInView && <span className="iksha-today-flag" aria-hidden="true">Today</span>}
            {Array.from({ length: days }, (_, index) => {
              const value = from + index * DAY;
              const hidden = compactHeader && new Date(value).getUTCDay() !== 1 ? { visibility: 'hidden' } : undefined;
              return <div className={`iksha-schedule-day ${value === today ? 'today' : ''}`} key={index}><span style={hidden}>{compactHeader ? '' : new Date(value).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }) + ' '}<b>{new Date(value).getUTCDate()}</b></span><small style={hidden}>{new Date(value).toLocaleDateString([], { month: 'short', timeZone: 'UTC' })}</small></div>;
            })}
          </div>
        </div>

        {allGroups.map((stage, index) => {
          const group = visible.filter((item) => (item.stage?.id || 'other') === stage.id);
          if (!group.length) return null;
          const scheduledGroup = group.filter((item) => item.start !== null && item.end !== null);
          const groupStart = scheduledGroup.length ? Math.min(...scheduledGroup.map((item) => item.start)) : calendarDate(stage.startDate);
          const groupEnd = scheduledGroup.length ? Math.max(...scheduledGroup.map((item) => item.end)) : null;
          const lateCount = group.filter((item) => itemStatus(item, today).late).length;
          const isCollapsed = collapsed.has(stage.id) && !query;
          const ordered = [...group].sort((a, b) => (Number(a.task.sourceSequence) || 0) - (Number(b.task.sourceSequence) || 0) || String(a.task.createdAt || '').localeCompare(String(b.task.createdAt || '')));
          return <section key={stage.id} className={`iksha-stage color-${index % 8}`}>
            <div className="iksha-schedule-row">
              <button className="iksha-schedule-label iksha-stage-heading" onClick={() => toggle(stage.id)} aria-expanded={!isCollapsed}>
                <span className="iksha-stage-number">{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{stage.name}</strong><small>{group.length} work items · {group.filter((item) => complete(item.task)).length} complete{lateCount ? ` · ${lateCount} late` : ''}</small></span>
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <div className="iksha-schedule-track">
                {groupStart !== null && groupEnd !== null && groupEnd > from && groupStart < to
                  ? <button className="iksha-stage-range" aria-label={`Open ${stage.name} stage details`} title={`${stage.name} · ${group.length} work items`} onClick={() => setSelectedStageId(stage.id)} style={{ left: (Math.max(groupStart, from) - from) / DAY * dayWidth, width: Math.max(20, (Math.min(groupEnd, to) - Math.max(groupStart, from)) / DAY * dayWidth - 3) }}><span><strong>{stage.name}</strong><small>{dateLabel(groupStart)} – {dateLabel(groupEnd - DAY)}</small></span><ArrowUpRight size={14} /></button>
                  : <button className="iksha-unscheduled" onClick={() => groupStart !== null ? setOrigin(groupStart) : setSelectedStageId(stage.id)}><ArrowUpRight size={12} />{groupStart !== null ? `${dateLabel(groupStart)} · Show` : 'View stage details'}</button>}
              </div>
            </div>
            {!isCollapsed && ordered.map((item) => {
              const status = itemStatus(item, today);
              const isScheduled = item.start !== null && item.end !== null;
              const dragging = drag?.id === item.task.id;
              const isTarget = drag?.target?.task.id === item.task.id;
              const shiftStart = dragging && drag.mode === 'move' && !drag.target ? drag.shift : 0;
              const shiftEnd = dragging && !drag.target ? drag.shift : 0;
              const start = isScheduled ? item.start + shiftStart * DAY : null;
              const end = isScheduled ? item.end + shiftEnd * DAY : null;
              // A bar being dragged stays mounted past the window edge so it always receives the release.
              const inRange = isScheduled && (dragging || (end > from && start < to));
              const movable = editable && canMove(item);
              const Icon = STATUS_ICON[status.key];
              const flag = status.late && status.key !== 'late' ? `${status.label} · late` : status.label;
              return <div className={`iksha-schedule-row iksha-task-row ${isTarget ? 'is-swap-target' : ''}`} key={item.task.id} data-task-row={item.task.id}>
                <button className="iksha-schedule-label" onClick={() => onOpenTask(item.task)}>
                  <span className={`iksha-task-state state-${status.key}`}>{complete(item.task) && <Check size={10} />}</span>
                  <span><strong>{item.task.title}</strong><small>{ownerName(item.task)} · {flag}</small></span>
                </button>
                <div className="iksha-schedule-track">
                  {inRange
                    ? <button
                      key="bar"
                      className={`iksha-task-block status-${status.key} ${status.late ? 'is-late' : ''} ${movable ? 'is-movable' : ''} ${dragging ? 'is-dragging' : ''}`}
                      title={`${item.task.title} · ${dateLabel(start)} – ${dateLabel(end - DAY)} · ${flag}${movable ? ' · Drag to move, pull the edge to resize, drop on another task to swap, or press Alt+Arrow' : ''}`}
                      aria-label={`${item.task.title}, ${dateLabel(start)} to ${dateLabel(end - DAY)}, ${flag}, ${ownerName(item.task)}${movable ? '. Alt plus arrow keys move it by a day' : ''}`}
                      style={{ left: Math.min(days * dayWidth - 12, Math.max(0, (Math.max(start, from) - from) / DAY * dayWidth)), width: Math.max(12, (Math.min(end, to) - Math.max(start, from)) / DAY * dayWidth - 3) }}
                      onPointerDown={(event) => beginDrag(event, item)}
                      onPointerMove={moveDrag}
                      onPointerUp={() => endDrag(item)}
                      onLostPointerCapture={() => { if (dragRef.current) endDrag(item); }}
                      onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                      onKeyDown={(event) => keyMove(event, item)}
                      onClick={(event) => { if (!movable || event.detail === 0) onOpenTask(item.task); }}
                    >
                      {Icon && <Icon size={12} aria-hidden="true" className="iksha-status-icon" />}
                      <span><strong>{item.task.title}</strong><small>{ownerName(item.task)} · {flag}</small></span>
                      {movable && <i className="iksha-resize-handle" aria-hidden="true" />}
                    </button>
                    : <button key="chip" className="iksha-unscheduled" onClick={() => isScheduled ? setOrigin(item.start - 3 * DAY) : onOpenTask(item.task)}><Clock3 size={12} />{isScheduled ? `${dateLabel(item.start)} · Show` : 'No dates · see below'}</button>}
                </div>
              </div>;
            })}
          </section>;
        })}
        {!visible.length && <p className="iksha-empty-search">No work items match your search.</p>}
      </div>
    </div>}

    {undated.length > 0 && <section className="iksha-undated" aria-labelledby="iksha-undated-title">
      <h3 id="iksha-undated-title">Not scheduled yet <span>{undated.length}</span></h3>
      <ul>{undated.map((item) => <li key={item.task.id}><button onClick={() => onOpenTask(item.task)}><strong>{item.task.title}</strong><small>{item.stage?.name || 'Additional work'} · {unscheduledReason(item)}</small></button></li>)}</ul>
    </section>}

    <Dialog open={Boolean(proposal)} onOpenChange={(open) => { if (!open && !proposal?.saving) setProposal(null); }}>
      <DialogContent className="iksha-schedule-preview">
        <DialogHeader>
          <span className="iksha-eyebrow">CHECK BEFORE SAVING</span>
          <DialogTitle>{proposal?.description}</DialogTitle>
          <DialogDescription>Nothing changes until you confirm. Confirmed changes are written to the Google Sheet, so Telegram and the web app stay in step.</DialogDescription>
        </DialogHeader>
        {proposal?.loading && <p className="iksha-preview-note">Checking dependencies…</p>}
        {proposal?.error && <p className="iksha-preview-conflict" role="alert">{proposal.error}</p>}
        {proposal?.preview && <div className="iksha-preview-body">
          {proposal.preview.conflicts.map((conflict, index) => <p key={index} className="iksha-preview-conflict" role="alert"><Octagon size={14} />{conflict.reason}</p>)}
          {proposal.preview.ok && <>
            <h4>You are moving</h4>
            <ul>{proposal.preview.affected.filter((item) => item.moved).map((item) => <li key={item.taskId}><strong>{item.taskName}</strong><span>{isoLabel(item.previousStart)} – {isoLabel(item.previousEnd)} → <b>{isoLabel(item.forecastStart)} – {isoLabel(item.forecastEnd)}</b></span></li>)}</ul>
            {proposal.preview.affected.some((item) => !item.moved) ? <>
              <h4>These dependent tasks move later</h4>
              <ul>{proposal.preview.affected.filter((item) => !item.moved).map((item) => <li key={item.taskId}><strong>{item.taskName}</strong><span>{isoLabel(item.previousStart)} → <b>{isoLabel(item.forecastStart)}</b></span></li>)}</ul>
            </> : <p className="iksha-preview-note">No other tasks are affected.</p>}
            {proposal.preview.warnings.map((warning, index) => <p key={index} className="iksha-preview-warning"><AlertTriangle size={14} />{warning.reason}</p>)}
            <p className="iksha-preview-note">{proposal.preview.finish ? `Projected finish after this change: ${isoLabel(proposal.preview.finish)}` : 'Finish date stays unconfirmed until every task has dates.'}</p>
          </>}
        </div>}
        <div className="iksha-preview-actions">
          <Button variant="outline" disabled={proposal?.saving} onClick={() => setProposal(null)}>Cancel</Button>
          <Button disabled={!proposal?.preview?.ok || proposal?.saving} onClick={confirm}>{proposal?.saving ? 'Saving…' : 'Confirm and save'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <TimelineStageDetails stage={allGroups.find((stage) => stage.id === selectedStageId)} items={items} members={members} projectId={projectId} namespace={namespace} onClose={() => setSelectedStageId(null)} onOpenTask={onOpenTask} />
    <footer className="iksha-schedule-caption">
      <span>{stages.some((stage) => stage.sheetPlan) ? 'Draft dates from sheet durations · Click a stage or work item for details' : editable ? 'Drag a task to move it · Pull its right edge to change its length · Drop it on another task to swap · You confirm every change' : 'Dates from the Google Sheet · Click a stage for its breakdown · Click a work item for its discussion'}</span>
      <span>Calendar days · Today is marked in red</span>
    </footer>
  </div>;
}
