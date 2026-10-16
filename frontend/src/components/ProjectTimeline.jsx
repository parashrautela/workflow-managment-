import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronDown, ChevronRight, Clock3, Hourglass, Minus, Octagon, Plus, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { calendarDate, calendarDay as DAY, timelineItems } from '@/lib/timeline';
import { canMove, itemStatus, moveFor, scheduleSummary, swapMoves, todayDate, undoMoves, unscheduledReason } from '@/lib/timelineStatus';
import { TimelineStageDetails } from '@/components/TimelineStageDetails';

const dateLabel = (value) => new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
const isoLabel = (value) => (value ? dateLabel(calendarDate(value)) : 'no date');
const isoRange = (start, end) => (start && start === end ? isoLabel(start) : `${isoLabel(start)} – ${isoLabel(end)}`);
const ZOOMS = [{ days: 14, label: '2 weeks', width: 82 }, { days: 42, label: '6 weeks', width: 40 }, { days: 91, label: '3 months', width: 20 }];
const STATUS_ICON = { late: AlertTriangle, blocked: Octagon, waiting: Hourglass, complete: Check };
const LONG_PRESS_MS = 320;
const EDGE = 44;

function verticalScroller(element) {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

// Work outside the visible window: a small arrow pinned to the side it lies on, tap to jump there.
function OffscreenChip({ value, before, onClick }) {
  return <button className={`iksha-offscreen ${before ? 'is-before' : 'is-after'}`} onClick={onClick} aria-label={`${before ? 'Ended' : 'Starts'} ${dateLabel(value)}. Show`}>
    {before ? <><ArrowLeft size={11} />{dateLabel(value)}</> : <>{dateLabel(value)}<ArrowRight size={11} /></>}
  </button>;
}

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
  const [picked, setPicked] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [notice, setNotice] = useState(null);
  const dragRef = useRef(null);
  const pressRef = useRef(null);
  const suppressClick = useRef(false);
  const autoScroll = useRef({ frame: 0, vx: 0, vy: 0 });
  const scrollerRef = useRef(null);
  const datesRef = useRef(null);
  const handlers = useRef({});
  // Swallow the click that follows a drag, but never a later tap: some browsers skip that click after a touch drag.
  const swallowNextClick = () => { suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 450); };

  const from = origin, to = origin + days * DAY;
  const dayWidth = ZOOMS.find((zoom) => zoom.days === days)?.width ?? Math.max(8, 1120 / days);
  const compactHeader = dayWidth < 40;
  const narrowDays = !compactHeader && dayWidth < 60;
  const allGroups = [...stages, { id: 'other', name: 'Additional work' }].filter((stage) => items.some((item) => (item.stage?.id || 'other') === stage.id));
  const ownerName = (task) => members.find((member) => (member.employeeId || member.id) === task.assigneeId)?.name || (task.assigneeId === 'founder' ? 'Founder' : task.assigneeName || 'Unassigned');
  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => `${item.task.title} ${item.stage?.name || 'Additional work'} ${ownerName(item.task)}`.toLowerCase().includes(query));
  const undated = visible.filter((item) => (item.start === null || item.end === null) && item.task.status !== 'Completed');
  const complete = (task) => ['Completed', 'completed'].includes(task.status);
  const toggle = (id) => setCollapsed((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const todayInView = today >= from && today < to;
  const pickedItem = picked ? items.find((item) => item.task.id === picked) : null;
  const gridStyle = { '--timeline-width': `${days * dayWidth}px`, '--timeline-day': `${dayWidth}px`, '--today-left': `${(today - from) / DAY * dayWidth}px` };

  // The date header sits outside the horizontal scroller so it can pin under the app bar; it follows the scroller sideways.
  const syncHeader = () => { if (datesRef.current && scrollerRef.current) datesRef.current.style.transform = `translateX(${-scrollerRef.current.scrollLeft}px)`; };
  useLayoutEffect(syncHeader);
  // Phones show only a few days, so land on today rather than the start of the window. Paging resets to the window start.
  const scrollTo = useRef('today');
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scrollTo.current;
    scrollTo.current = null;
    if (target === 'today' && todayInView) scroller.scrollLeft = Math.max(0, (today - from) / DAY * dayWidth - dayWidth);
    else if (target === 'start') scroller.scrollLeft = 0;
    syncHeader();
  }, [origin, days, items.length > 0]);
  const goToday = () => { scrollTo.current = 'today'; setOrigin(today - 7 * DAY); };
  const page = (direction) => { scrollTo.current = 'start'; setOrigin(origin + direction * Math.max(7, Math.round(days / 2)) * DAY); };
  // Task names repeat their stage when titles clash across the plan; inside the stage group that prefix is noise.
  const shortTitle = (task, stage) => {
    const base = String(stage?.name || '').replace(/ \([0-9a-z]+\)$/i, '');
    return base && task.title.startsWith(`${base} — `) ? task.title.slice(base.length + 3) : task.title;
  };

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
  const nudge = (item, startDays, endDays, description) => propose([moveFor(item, startDays, endDays)], description);

  // ---- Dragging: mouse starts at once; touch needs a long press, so a normal swipe still scrolls. ----
  function startDrag(item, mode, x, y, touch) {
    dragRef.current = { id: item.task.id, item, mode, x, y, lastX: x, lastY: y, scrollLeft: scrollerRef.current?.scrollLeft || 0, shift: 0, target: null, moved: false, touch };
    setDrag({ ...dragRef.current });
  }
  function updateDrag(clientX, clientY) {
    const current = dragRef.current;
    if (!current) return;
    current.lastX = clientX; current.lastY = clientY;
    if (!current.moved && Math.abs(clientX - current.x) < 5 && Math.abs(clientY - current.y) < 8) return;
    current.moved = true;
    const scrolled = (scrollerRef.current?.scrollLeft || 0) - current.scrollLeft;
    current.shift = Math.round((clientX - current.x + scrolled) / dayWidth);
    if (current.mode === 'resize') current.shift = Math.max(current.shift, -Math.round((current.item.end - current.item.start) / DAY) + 1);
    const row = document.elementsFromPoint(clientX, clientY).map((element) => element.closest?.('[data-task-row]')).find(Boolean);
    const target = row && row.dataset.taskRow !== current.id && current.mode === 'move' ? items.find((candidate) => candidate.task.id === row.dataset.taskRow) : null;
    current.target = target && canMove(target) ? target : null;
    setDrag({ ...current });
    edgeScroll(clientX, clientY);
  }
  // Near an edge, keep scrolling so a task can travel beyond what fits on screen.
  function edgeScroll(clientX, clientY) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const labelWidth = scroller.querySelector('.iksha-schedule-label')?.offsetWidth || 0;
    const state = autoScroll.current;
    state.vx = clientX < rect.left + labelWidth + EDGE ? -10 : clientX > rect.right - EDGE ? 10 : 0;
    state.vy = clientY < 64 + EDGE + 40 ? -10 : clientY > window.innerHeight - EDGE - 70 ? 10 : 0;
    if ((state.vx || state.vy) && !state.frame) {
      const step = () => {
        const current = dragRef.current;
        if (!current || (!state.vx && !state.vy)) { state.frame = 0; return; }
        if (state.vx) scroller.scrollLeft += state.vx;
        if (state.vy) verticalScroller(scroller).scrollBy(0, state.vy);
        handlers.current.updateDrag(current.lastX, current.lastY);
        state.frame = requestAnimationFrame(step);
      };
      state.frame = requestAnimationFrame(step);
    }
  }
  function stopDrag() {
    cancelAnimationFrame(autoScroll.current.frame);
    autoScroll.current = { frame: 0, vx: 0, vy: 0 };
    dragRef.current = null;
    setDrag(null);
  }
  function finishDrag() {
    const current = dragRef.current;
    stopDrag();
    if (!current) return;
    if (!current.moved) {
      // A long press without moving picks the task up and shows the adjust bar.
      if (current.touch) { swallowNextClick(); setPicked(current.id); }
      return;
    }
    swallowNextClick();
    if (current.target) return void propose(swapMoves(current.item, current.target), `Swap “${current.item.task.title}” with “${current.target.task.title}”`);
    if (!current.shift) return;
    const title = current.item.task.title;
    propose([current.mode === 'resize' ? moveFor(current.item, 0, current.shift) : moveFor(current.item, current.shift)], current.mode === 'resize' ? `Change the length of “${title}”` : `Move “${title}”`);
  }
  handlers.current = { updateDrag, finishDrag, stopDrag };

  function onBarPointerDown(event, item) {
    if (!editable || !canMove(item) || event.button !== 0) return;
    const mode = event.target.closest('.iksha-resize-handle') ? 'resize' : 'move';
    if (event.pointerType === 'mouse') {
      event.currentTarget.setPointerCapture(event.pointerId);
      startDrag(item, mode, event.clientX, event.clientY, false);
      return;
    }
    const press = { item, mode, x: event.clientX, y: event.clientY };
    press.timer = setTimeout(() => {
      pressRef.current = null;
      navigator.vibrate?.(12);
      startDrag(item, mode, press.x, press.y, true);
    }, LONG_PRESS_MS);
    pressRef.current = press;
  }

  // Touch moves are handled on the document with a non-passive listener, so an active drag can stop the page from scrolling.
  useEffect(() => {
    const cancelPress = () => { if (pressRef.current) { clearTimeout(pressRef.current.timer); pressRef.current = null; } };
    const onMove = (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      const press = pressRef.current;
      if (press && Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 10) cancelPress();
      if (dragRef.current?.touch) { event.preventDefault(); handlers.current.updateDrag(touch.clientX, touch.clientY); }
    };
    const onEnd = () => { cancelPress(); if (dragRef.current?.touch) handlers.current.finishDrag(); };
    const onCancel = () => { cancelPress(); if (dragRef.current?.touch) handlers.current.stopDrag(); };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onCancel);
    return () => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); document.removeEventListener('touchcancel', onCancel); cancelPress(); };
  }, []);

  // Keyboard alternative: Alt+Arrow moves a day, Alt+Shift+Arrow changes the length.
  function keyMove(event, item) {
    if (!editable || !canMove(item) || !event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    nudge(item, event.shiftKey ? 0 : step, step, event.shiftKey ? `Change the length of “${item.task.title}”` : `Move “${item.task.title}”`);
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
        <p>{summary.finish !== null ? `Projected finish ${dateLabel(summary.finish)}` : 'Finish date not confirmed'}{summary.unscheduled ? ` · ${summary.unscheduled} without dates` : ''}</p>
      </div>
      <span><CalendarDays size={14} />{scheduled.length} scheduled · {items.length - scheduled.length} without dates</span>
    </div>

    <div className="iksha-timeline-toolbar" role="toolbar" aria-label="Timeline view">
      <div className="iksha-date-nav">
        <Button variant="ghost" size="icon-sm" aria-label="Previous period" onClick={() => page(-1)}><ArrowLeft /></Button>
        <strong>{dateLabel(from)} – {dateLabel(to - DAY)}<span className="iksha-year">, {new Date(to - DAY).getUTCFullYear()}</span></strong>
        <Button variant="ghost" size="icon-sm" aria-label="Next period" onClick={() => page(1)}><ArrowRight /></Button>
      </div>
      <div className="iksha-toolbar-chips">
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        <div className="iksha-zoom">{ZOOMS.map((zoom) => <button key={zoom.days} aria-pressed={days === zoom.days} className={days === zoom.days ? 'active' : ''} onClick={() => setDays(zoom.days)}>{zoom.label}</button>)}</div>
        {scheduled.length > 0 && <Button variant="outline" size="sm" aria-pressed={!ZOOMS.some((zoom) => zoom.days === days)} onClick={() => { const first = Math.min(...scheduled.map((item) => item.start)); setOrigin(first); setDays(Math.max(28, Math.ceil((Math.max(...scheduled.map((item) => item.end)) - first) / DAY))); }}>Entire plan</Button>}
        <Button variant="outline" size="sm" onClick={() => setCollapsed(allGroups.some((stage) => collapsed.has(stage.id)) ? new Set() : new Set(allGroups.map((stage) => stage.id)))}>{allGroups.some((stage) => collapsed.has(stage.id)) ? 'Expand all' : 'Collapse all'}</Button>
      </div>
    </div>

    <label className="iksha-timeline-search"><span className="sr-only">Search timeline tasks</span><input type="search" placeholder="Find a work item or person…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>

    {notice && <div className="iksha-schedule-notice" role="status"><span>{notice.text}</span>{notice.undo?.length > 0 && <Button variant="outline" size="sm" onClick={undo}><Undo2 />Undo</Button>}<button className="iksha-notice-close" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={16} /></button></div>}

    {!items.length ? <div className="iksha-timeline-empty"><CalendarDays size={28} /><h3>No work items yet.</h3><p>Choose a project workflow to generate its tasks and schedule.</p></div> : <div className={`iksha-schedule-frame ${compactHeader ? 'iksha-plan-fit' : ''} ${todayInView ? 'has-today' : ''} ${drag ? 'is-dragging-any' : ''}`} style={gridStyle}>
      <div className="iksha-schedule-headbar">
        <div className="iksha-schedule-label">STAGE / WORK ITEM</div>
        <div className="iksha-headbar-viewport">
          <div className="iksha-schedule-dates" ref={datesRef}>
            {todayInView && <span className="iksha-today-flag" aria-hidden="true">Today</span>}
            {Array.from({ length: days }, (_, index) => {
              const value = from + index * DAY;
              const hidden = compactHeader && new Date(value).getUTCDay() !== 1 ? { visibility: 'hidden' } : undefined;
              const date = new Date(value);
              if (narrowDays) return <div className={`iksha-schedule-day is-narrow ${value === today ? 'today' : ''}`} key={index}><small className={date.getUTCDate() === 1 || index === 0 ? 'iksha-day-month' : ''}>{date.getUTCDate() === 1 || index === 0 ? date.toLocaleDateString([], { month: 'short', timeZone: 'UTC' }) : date.toLocaleDateString([], { weekday: 'narrow', timeZone: 'UTC' })}</small><b>{date.getUTCDate()}</b></div>;
              return <div className={`iksha-schedule-day ${value === today ? 'today' : ''}`} key={index}><span style={hidden}>{compactHeader ? '' : date.toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }) + ' '}<b>{date.getUTCDate()}</b></span><small style={hidden}>{date.toLocaleDateString([], { month: 'short', timeZone: 'UTC' })}</small></div>;
            })}
          </div>
        </div>
      </div>

      <div className="iksha-schedule-scroll" ref={scrollerRef} onScroll={syncHeader}>
        <div className="iksha-schedule-grid">
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
              <div className="iksha-schedule-row iksha-stage-row">
                <button className="iksha-schedule-label iksha-stage-heading" onClick={() => toggle(stage.id)} aria-expanded={!isCollapsed}>
                  <span className="iksha-stage-number">{String(index + 1).padStart(2, '0')}</span>
                  <span><strong>{stage.name}</strong><small>{group.filter((item) => complete(item.task)).length}/{group.length} done{lateCount ? ` · ${lateCount} late` : ''}</small></span>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="iksha-schedule-track">
                  {groupStart !== null && groupEnd !== null && groupEnd > from && groupStart < to
                    ? <button className="iksha-stage-range" aria-label={`Open ${stage.name} stage details`} title={`${stage.name} · ${dateLabel(groupStart)} – ${dateLabel(groupEnd - DAY)}`} onClick={() => setSelectedStageId(stage.id)} style={{ left: (Math.max(groupStart, from) - from) / DAY * dayWidth, width: Math.max(20, (Math.min(groupEnd, to) - Math.max(groupStart, from)) / DAY * dayWidth - 3) }}><span><strong>{stage.name}</strong><small>{dateLabel(groupStart)} – {dateLabel(groupEnd - DAY)}</small></span><ArrowUpRight size={14} /></button>
                    : groupStart !== null ? <OffscreenChip value={groupEnd !== null && groupEnd <= from ? groupEnd - DAY : groupStart} before={groupEnd !== null && groupEnd <= from} onClick={() => setOrigin(groupStart - 3 * DAY)} /> : <button className="iksha-unscheduled" onClick={() => setSelectedStageId(stage.id)}><ArrowUpRight size={12} />Stage details</button>}
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
                const barWidth = Math.max(12, (Math.min(end ?? 0, to) - Math.max(start ?? 0, from)) / DAY * dayWidth - 3);
                return <div className={`iksha-schedule-row iksha-task-row ${isTarget ? 'is-swap-target' : ''} ${picked === item.task.id ? 'is-picked' : ''}`} key={item.task.id} data-task-row={item.task.id}>
                  <button className="iksha-schedule-label" onClick={() => onOpenTask(item.task)}>
                    <span className={`iksha-task-state state-${status.key}`}>{complete(item.task) && <Check size={10} />}</span>
                    <span><strong>{shortTitle(item.task, item.stage)}</strong><small>{ownerName(item.task)} · {flag}</small></span>
                  </button>
                  <div className="iksha-schedule-track">
                    {inRange
                      ? <button
                        key="bar"
                        className={`iksha-task-block status-${status.key} ${status.late ? 'is-late' : ''} ${barWidth < 64 ? 'is-short' : ''} ${movable ? 'is-movable' : ''} ${dragging ? 'is-dragging' : ''} ${dragging && drag.touch ? 'is-lifted' : ''}`}
                        title={`${item.task.title} · ${dateLabel(start)} – ${dateLabel(end - DAY)} · ${flag}${movable ? ' · Drag to move, pull the edge to resize, drop on another task to swap, or press Alt+Arrow' : ''}`}
                        aria-label={`${item.task.title}, ${dateLabel(start)} to ${dateLabel(end - DAY)}, ${flag}, ${ownerName(item.task)}${movable ? '. Alt plus arrow keys move it by a day' : ''}`}
                        style={{ left: Math.min(days * dayWidth - 12, Math.max(0, (Math.max(start, from) - from) / DAY * dayWidth)), width: barWidth }}
                        onPointerDown={(event) => onBarPointerDown(event, item)}
                        onPointerMove={(event) => { if (dragRef.current && !dragRef.current.touch) updateDrag(event.clientX, event.clientY); }}
                        onPointerUp={() => { if (dragRef.current && !dragRef.current.touch) finishDrag(); }}
                        onLostPointerCapture={() => { if (dragRef.current && !dragRef.current.touch) finishDrag(); }}
                        onContextMenu={(event) => { if (movable) event.preventDefault(); }}
                        onKeyDown={(event) => keyMove(event, item)}
                        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpenTask(item.task); }}
                      >
                        {Icon && <Icon size={12} aria-hidden="true" className="iksha-status-icon" />}
                        <span><strong>{shortTitle(item.task, item.stage)}</strong><small>{dateLabel(start)} – {dateLabel(end - DAY)} · {flag}</small></span>
                        {movable && <i className="iksha-resize-handle" aria-hidden="true" />}
                      </button>
                      : isScheduled ? <OffscreenChip key="chip" value={item.end <= from ? item.end - DAY : item.start} before={item.end <= from} onClick={() => setOrigin(item.start - 3 * DAY)} /> : <button key="chip" className="iksha-unscheduled" onClick={() => onOpenTask(item.task)}><Clock3 size={12} />No dates · see below</button>}
                  </div>
                </div>;
              })}
            </section>;
          })}
          {!visible.length && <p className="iksha-empty-search">No work items match your search.</p>}
        </div>
      </div>
    </div>}

    {undated.length > 0 && <section className="iksha-undated" aria-labelledby="iksha-undated-title">
      <h3 id="iksha-undated-title">Not scheduled yet <span>{undated.length}</span></h3>
      <ul>{undated.map((item) => <li key={item.task.id}><button onClick={() => onOpenTask(item.task)}><strong>{item.task.title}</strong><small>{item.stage?.name || 'Additional work'} · {unscheduledReason(item)}</small></button></li>)}</ul>
    </section>}

    {pickedItem && editable && canMove(pickedItem) && !proposal && <div className="iksha-adjust-bar" role="dialog" aria-label={`Adjust ${pickedItem.task.title}`}>
      <div className="iksha-adjust-title"><strong>{pickedItem.task.title}</strong><small>{dateLabel(pickedItem.start)} – {dateLabel(pickedItem.end - DAY)} · {Math.round((pickedItem.end - pickedItem.start) / DAY)} day{pickedItem.end - pickedItem.start === DAY ? '' : 's'}</small></div>
      <div className="iksha-adjust-actions">
        <button onClick={() => nudge(pickedItem, -1, -1, `Move “${pickedItem.task.title}” a day earlier`)}><ArrowLeft size={16} />Earlier</button>
        <button onClick={() => nudge(pickedItem, 1, 1, `Move “${pickedItem.task.title}” a day later`)}>Later<ArrowRight size={16} /></button>
        <button disabled={pickedItem.end - pickedItem.start <= DAY} onClick={() => nudge(pickedItem, 0, -1, `Shorten “${pickedItem.task.title}” by a day`)}><Minus size={16} />Shorter</button>
        <button onClick={() => nudge(pickedItem, 0, 1, `Lengthen “${pickedItem.task.title}” by a day`)}><Plus size={16} />Longer</button>
      </div>
      <div className="iksha-adjust-footer"><button onClick={() => { setPicked(null); onOpenTask(pickedItem.task); }}>Open task</button><button onClick={() => setPicked(null)}>Done</button></div>
    </div>}

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
            <ul>{proposal.preview.affected.filter((item) => item.moved).map((item) => <li key={item.taskId}><strong>{item.taskName}</strong><span>{isoRange(item.previousStart, item.previousEnd)} → <b>{isoRange(item.forecastStart, item.forecastEnd)}</b></span></li>)}</ul>
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
      <span>{editable ? <><span className="iksha-only-fine">Drag a task to move it · Pull its right edge to change its length · Drop it on another task to swap</span><span className="iksha-only-coarse">Press and hold a task to pick it up, then drag · Hold its right edge to change its length</span> · You confirm every change</> : 'Dates from the Google Sheet · Tap a stage for its breakdown · Tap a work item for its discussion'}</span>
      <span>Calendar days · Today is marked in red</span>
    </footer>
  </div>;
}
