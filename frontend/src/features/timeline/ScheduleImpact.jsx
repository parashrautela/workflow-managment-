const label = (value) =>
  value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : 'unconfirmed';

export function ScheduleImpact({ preview, pending, error }) {
  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-xs" aria-live="polite">
      {pending ? (
        <p>Checking the schedule…</p>
      ) : error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : preview ? (
        <>
          <p className="font-medium">Review before confirming</p>
          {(preview.conflicts || []).map((item, index) => (
            <p key={index} className="text-destructive">
              {item.reason}
            </p>
          ))}
          {(preview.created || []).map((item, index) => (
            <p key={index}>
              <strong>{item.title}</strong>: {label(item.start)} – {label(item.end)}
            </p>
          ))}
          {(preview.affected || []).map((item) => (
            <p key={item.taskId}>
              <strong>{item.taskName || item.title}</strong>: {label(item.previousStart)} –{' '}
              {label(item.previousEnd)} → {label(item.forecastStart)} – {label(item.forecastEnd)}
              {!item.moved && !item.committed ? ' · dependent work' : ''}
            </p>
          ))}
          {!(preview.affected || []).some((item) => !item.moved && !item.committed) && (
            <p>No other task dates change.</p>
          )}
          {(preview.warnings || []).map((item, index) => (
            <p key={index}>{item.reason}</p>
          ))}
          <p>
            Projected finish: <strong>{label(preview.finish)}</strong>. Nothing changes until you
            confirm.
          </p>
        </>
      ) : (
        <p>Complete the fields to preview the dates and any effect on other work.</p>
      )}
    </div>
  );
}
