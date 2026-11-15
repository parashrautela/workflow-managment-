import { formatDateShort } from '@/lib/dates';

const label = (value) => formatDateShort(value) || 'unconfirmed';

export function ScheduleImpact({ preview, pending, error }) {
  return (
    <div className="space-y-2 card-box bg-muted/30 text-xs" aria-live="polite">
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
          {(preview.created || []).map((item, index) => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const overdueDays =
              item.end && item.end < todayStr
                ? Math.max(1, Math.round((new Date(todayStr) - new Date(item.end)) / 86400000))
                : 0;
            return (
              <div key={index} className="space-y-1">
                <p>
                  <strong>{item.title}</strong>: {label(item.start)} – {label(item.end)}
                </p>
                {overdueDays > 0 && (
                  <p className="font-medium text-warning">
                    ⚠️ This task ends in the past and will start {overdueDays}{' '}
                    {overdueDays === 1 ? 'day' : 'days'} overdue.
                  </p>
                )}
              </div>
            );
          })}
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
