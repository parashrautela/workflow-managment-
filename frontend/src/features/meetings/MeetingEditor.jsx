import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { request } from '@/lib/api';
const localTime = (value) => new Date(Date.parse(value) + 330 * 60000).toISOString().slice(0, 16);
export function MeetingEditor({ open, onOpenChange, task, meeting, onSaved }) {
  const [people, setPeople] = useState([]),
    [form, setForm] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [custom, setCustom] = useState('');
  useEffect(() => {
    if (!open || !task) return;
    let active = true;
    setPeople([]);
    setError('');
    setCustom('');
    setForm({
      title: meeting?.title || task.title,
      location: meeting?.location || '',
      startsAt: localTime(meeting?.startsAt || new Date(Date.now() + 86400000).toISOString()),
      attendeeIds: meeting?.attendeeIds || [],
      reminderMinutes: meeting?.reminderMinutes || [2880, 60],
      previousEvening: meeting?.previousEvening ?? true,
      groupFallback: meeting?.groupFallback ?? false,
    });
    request(`/api/founder/tasks/${task.id}/participants`)
      .then((data) => {
        if (active) setPeople(data.people);
      })
      .catch((problem) => {
        if (active) setError(problem.message);
      });
    return () => {
      active = false;
    };
  }, [open, task?.id, meeting?.id]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request(
        meeting ? `/api/founder/meetings/${meeting.id}` : `/api/founder/tasks/${task.id}/meeting`,
        {
          method: meeting ? 'PATCH' : 'POST',
          body: {
            ...form,
            startsAt: new Date(form.startsAt + ':00+05:30').toISOString(),
            ...(meeting ? { revision: meeting.revision } : {}),
          },
        },
      );
      onOpenChange(false);
      onSaved?.();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{meeting ? 'Edit meeting' : 'Schedule a task meeting'}</DialogTitle>
          <DialogDescription>
            Choose who needs to attend. Scheduling queues their notifications; the task stays open.
          </DialogDescription>
        </DialogHeader>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <label className="grid gap-1 text-xs">
              Meeting title
              <Input
                required
                maxLength={180}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs">
              Date and time · India (IST)
              <Input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs">
              On-site location or meeting link
              <Input
                maxLength={300}
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Project site, address or meeting link"
              />
            </label>
            <fieldset className="space-y-2 rounded-lg border p-3">
              <legend className="text-xs font-medium">Attendees</legend>
              {people.map((person) => (
                <label key={person.id} className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={form.attendeeIds.includes(person.id)}
                    onChange={(e) =>
                      set(
                        'attendeeIds',
                        e.target.checked
                          ? [...form.attendeeIds, person.id]
                          : form.attendeeIds.filter((id) => id !== person.id),
                      )
                    }
                  />
                  <span>
                    {person.name} · {person.role}
                    <small className="block text-muted-foreground">
                      {person.connected
                        ? 'Personal Telegram connected'
                        : 'Needs Telegram connection; ask them to press Start'}
                    </small>
                  </span>
                </label>
              ))}
              {!people.length && (
                <p className="text-xs text-muted-foreground">
                  No project people available. Add project members first.
                </p>
              )}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Reminders</legend>
              {[...new Set([2880, 60, ...form.reminderMinutes])]
                .sort((a, b) => b - a)
                .map((minutes) => (
                  <label key={minutes} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.reminderMinutes.includes(minutes)}
                      onChange={(e) =>
                        set(
                          'reminderMinutes',
                          e.target.checked
                            ? [...form.reminderMinutes, minutes]
                            : form.reminderMinutes.filter((value) => value !== minutes),
                        )
                      }
                    />
                    {minutes === 2880
                      ? 'Two days before'
                      : minutes === 60
                        ? 'One hour before'
                        : `${minutes} minutes before`}
                  </label>
                ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.previousEvening}
                  onChange={(e) => set('previousEvening', e.target.checked)}
                />
                Previous evening at 6 PM IST
              </label>
              <div className="flex gap-2">
                <Input
                  aria-label="Custom reminder minutes before"
                  type="number"
                  min={1}
                  max={10080}
                  value={custom}
                  placeholder="Minutes before"
                  onChange={(e) => setCustom(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!custom || form.reminderMinutes.length >= 5}
                  onClick={() => {
                    const value = Number(custom);
                    if (Number.isInteger(value) && value >= 1 && value <= 10080) {
                      set('reminderMinutes', [...new Set([...form.reminderMinutes, value])]);
                      setCustom('');
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </fieldset>
            <label className="flex items-start gap-2 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={form.groupFallback}
                onChange={(e) => set('groupFallback', e.target.checked)}
              />
              <span>
                Notify the project Telegram group if an attendee has no personal connection.
                <small className="block text-muted-foreground">
                  The client and everyone else in that group can see these meeting details.
                </small>
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Past reminder times are skipped. Delivery status appears in Meetings.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy || !form.attendeeIds.length} type="submit">
              {busy
                ? 'Saving…'
                : meeting
                  ? 'Save changes & notify attendees'
                  : 'Schedule & notify attendees'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
