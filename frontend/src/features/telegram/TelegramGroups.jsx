import { toast } from '@/components/ui/toaster';
import { rolesOf, hasRole } from '@/features/people/lib/roles';
import React, { useEffect, useState } from 'react';
import { Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Input } from '@/components/ui/input';
import { todayInput } from '@/lib/dates';
import { Empty } from '@/components/ui/empty';
import {
  isMemberSaved,
  memberChanged,
  memberValues,
  setupBlocker,
} from '@/features/telegram/lib/memberSetup';

async function api(url, method = 'GET', data) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}

const suggestedRoles = [
  'Founder',
  'Client',
  'Supervisor',
  'Designer',
  'Painter',
  'Carpenter',
  'Electrician',
  'Contractor',
];

const without =
  (...keys) =>
  (current) =>
    Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key)));

export function TelegramGroups({ projects = [], onProjectsChanged, project, embedded = false }) {
  const [groups, setGroups] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [editing, setEditing] = useState({}); // saved people opened with Edit
  const [cards, setCards] = useState({}); // per person: { status: 'saving' | 'saved' | 'error', text }
  const [savingAll, setSavingAll] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState(() => todayInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState('');
  const load = async () => {
    try {
      const data = await api('/api/founder/telegram-groups');
      setGroups(data.groups || []);
      setError('');
    } catch (failure) {
      setError(failure.message);
    }
  };
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  const group = project
    ? groups.find((item) => item.groupChatId === project.telegramGroupChatId)
    : groups.find((item) => item.groupChatId === selectedId) || groups[0];
  const activeMembers =
    group?.members.filter((member) => member.membershipStatus === 'Active') || [];
  const linkedProject =
    project || projects.find((project) => project.telegramGroupChatId === group?.groupChatId);
  const needsSetup = !linkedProject || linkedProject.telegramSetupPending;
  const keyOf = (member) => `${group.groupChatId}:${member.telegramUserId}`;
  const draftOf = (member) => drafts[keyOf(member)];
  const isOpen = (member) => !isMemberSaved(member) || editing[keyOf(member)];
  const toSave = activeMembers.filter(
    (member) =>
      isOpen(member) &&
      memberChanged(member, draftOf(member)) &&
      memberValues(member, draftOf(member)).role,
  );
  const savedCount = activeMembers.filter(isMemberSaved).length;
  const blocker = setupBlocker(activeMembers, draftOf);
  const anySaving = savingAll || Object.values(cards).some((card) => card?.status === 'saving');
  const run = async (work, message) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      if (onProjectsChanged) await onProjectsChanged();
      toast(message);
    } catch (failure) {
      toast(failure.message, { error: true });
    } finally {
      setBusy(false);
    }
  };
  const postMember = (member) => {
    const { name, role } = memberValues(member, draftOf(member));
    return api(
      `/api/founder/telegram-groups/${group.groupChatId}/members/${member.telegramUserId}`,
      'POST',
      { name, role },
    );
  };
  const finishSaved = async (keys, message) => {
    await load();
    if (onProjectsChanged) await onProjectsChanged();
    setDrafts(without(...keys));
    setEditing(without(...keys));
    setCards((current) => ({
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, { status: 'saved' }])),
    }));
    toast(message);
  };
  const failCard = (key, failure) =>
    setCards((current) => ({ ...current, [key]: { status: 'error', text: failure.message } }));
  const saveMember = async (member) => {
    const key = keyOf(member);
    const { name } = memberValues(member, draftOf(member));
    setCards((current) => ({ ...current, [key]: { status: 'saving' } }));
    try {
      await postMember(member);
      await finishSaved([key], `${name} saved and announced in Telegram.`);
    } catch (failure) {
      failCard(key, failure);
    }
  };
  const saveAll = async () => {
    setSavingAll(true);
    const done = [];
    for (const member of toSave) {
      const key = keyOf(member);
      setCards((current) => ({ ...current, [key]: { status: 'saving' } }));
      try {
        await postMember(member);
        done.push(key);
      } catch (failure) {
        failCard(key, failure);
        break; // the rest stay open, so nothing looks saved that was not
      }
    }
    if (done.length)
      await finishSaved(done, `Saved ${done.length} ${done.length === 1 ? 'person' : 'people'}.`);
    setSavingAll(false);
  };
  const startEdit = (member) => {
    setEditing((current) => ({ ...current, [keyOf(member)]: true }));
    setCards(without(keyOf(member)));
  };
  const cancelEdit = (member) => {
    setEditing(without(keyOf(member)));
    setDrafts(without(keyOf(member)));
    setCards(without(keyOf(member)));
  };
  const createProject = () =>
    run(async () => {
      return api(`/api/founder/telegram-groups/${group.groupChatId}/create-project`, 'POST', {
        projectName: projectName.trim() || group.title,
        startDate,
      });
    }, 'Members saved. Choose the project type next.');
  const avatar = (
    <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold">
      <Users className="size-4" />
    </span>
  );
  const renderMember = (member) => {
    const key = keyOf(member);
    const draft = drafts[key] || {};
    const card = cards[key];
    const saving = card?.status === 'saving';
    if (!isOpen(member))
      return (
        <div key={member.telegramUserId} className="card-box space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            {avatar}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{member.assignedName}</p>
              <p className="text-xs text-muted-foreground">Telegram ID {member.telegramUserId}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {rolesOf(member.assignedRole).map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                >
                  {role}
                </span>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={anySaving}
              aria-label={`Edit ${member.assignedName}`}
              onClick={() => startEdit(member)}
            >
              Edit
            </Button>
          </div>
          {card?.status === 'saved' && (
            <p role="status" className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="size-3" />
              Saved and announced in Telegram.
            </p>
          )}
        </div>
      );
    const saved = isMemberSaved(member);
    const changed = memberChanged(member, draft);
    const values = memberValues(member, draft);
    return (
      <div key={member.telegramUserId} className="card-box">
        <div className="mb-3 flex items-center gap-2">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{member.telegramName}</p>
            <p className="text-xs text-muted-foreground">Telegram ID {member.telegramUserId}</p>
          </div>
          {changed && (
            <span className="text-xs text-warning">
              {saved ? 'Unsaved changes' : 'Not saved yet'}
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="space-y-1 text-xs font-medium">
            Name in project
            <Input
              value={draft.name ?? (member.assignedName || member.telegramName)}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [key]: { ...current[key], name: event.target.value },
                }))
              }
            />
          </label>
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-xs font-medium">Roles (choose one or more)</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {suggestedRoles.map((role) => (
                <label key={role} className="flex min-h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-primary"
                    checked={hasRole(values.role, role)}
                    onChange={(event) => {
                      const current = rolesOf(values.role);
                      setDrafts((all) => ({
                        ...all,
                        [key]: {
                          ...all[key],
                          role: (event.target.checked
                            ? [...current, role]
                            : current.filter((item) => item !== role)
                          ).join(', '),
                        },
                      }));
                    }}
                  />
                  {role}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {card?.status === 'error' ? (
            <p role="alert" className="mr-auto text-sm text-overdue">
              {card.text}
            </p>
          ) : (
            !values.role && (
              <p className="mr-auto text-xs text-muted-foreground">
                Choose at least one role to save.
              </p>
            )
          )}
          {saved && (
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => cancelEdit(member)}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={anySaving || !values.role || !changed}
            onClick={() => saveMember(member)}
          >
            {saving ? 'Saving…' : saved ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {embedded && needsSetup && (
            <p className="text-xs font-medium text-primary">Step 1 · Members</p>
          )}
          {embedded ? <h2 className="type-heading-20">Add members</h2> : <h1>Telegram groups</h1>}
          <p className="mt-1 text-sm text-muted-foreground">
            {embedded
              ? 'Give each person in this Telegram group a name and a role. You need at least one client and one team member.'
              : 'Set the names and roles of the client and team members discovered in this project’s Telegram group before choosing a project type.'}
          </p>
        </div>
        <RefreshButton
          disabled={busy}
          onRefresh={() =>
            run(
              () =>
                api('/api/founder/telegram-groups/refresh', 'POST', {
                  groupChatId: group?.groupChatId,
                }),
              'Recorded Telegram members refreshed. If someone is missing, ask them to send /join in the group.',
            )
          }
        />
      </div>
      {error && (
        <p
          role="alert"
          className="card-box border-overdue-border bg-overdue-bg text-sm text-overdue"
        >
          {error}
        </p>
      )}
      {group ? (
        <div className={embedded ? 'space-y-4' : 'grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]'}>
          {!embedded && (
            <aside
              className="overflow-hidden rounded-xl border bg-card"
              aria-label="Telegram groups"
            >
              {groups.map((item) => {
                const active = item.members.filter(
                  (member) => member.membershipStatus === 'Active',
                );
                return (
                  <button
                    type="button"
                    key={item.groupChatId}
                    onClick={() => {
                      setSelectedId(item.groupChatId);
                      setProjectName(item.title);
                    }}
                    className={`w-full border-b px-4 py-3 text-left hover:bg-muted/70 ${group?.groupChatId === item.groupChatId ? 'bg-accent/70' : ''}`}
                  >
                    <span className="block truncate text-sm font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {active.length} people ·{' '}
                      {active.filter((member) => !member.assignedRole).length} roles pending
                    </span>
                  </button>
                );
              })}
            </aside>
          )}
          <section
            className={embedded ? 'min-w-0 space-y-4' : 'min-w-0 space-y-4 card-box bg-card sm:p-4'}
          >
            {!embedded && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="type-heading-20">{group.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    Telegram group ID {group.groupChatId} · {activeMembers.length} people recorded
                    {group.telegramMemberCount
                      ? ` · ${group.telegramMemberCount} Telegram accounts including bots`
                      : ''}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                  {needsSetup ? 'Project needs setup' : `Linked to ${linkedProject.name}`}
                </span>
              </div>
            )}
            {embedded && !needsSetup && blocker && (
              <p role="status" className="text-sm text-warning">
                To continue to the project type: {blocker}
              </p>
            )}
            {group.discoveryWarning && (
              <p role="status" className="text-sm text-warning">
                {group.discoveryWarning}
              </p>
            )}
            {activeMembers.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="status" className="text-xs text-muted-foreground">
                  {savedCount} of {activeMembers.length} saved
                </p>
                {toSave.length > 1 && (
                  <Button variant="outline" size="sm" disabled={anySaving} onClick={saveAll}>
                    {savingAll ? 'Saving…' : `Save all (${toSave.length})`}
                  </Button>
                )}
              </div>
            )}
            <div className="space-y-3">
              {activeMembers.length ? (
                activeMembers.map(renderMember)
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No people observed yet. Add members after the bot, or ask them to send /join.
                </p>
              )}
            </div>
            {needsSetup && (
              <div className="space-y-3 border-t pt-4">
                <div>
                  <h3 className="type-label-14-strong">Finish project setup</h3>
                  <p className="text-xs text-muted-foreground">
                    Next you choose the project type, which creates the tasks and announces the
                    start in the Telegram group. Team members need their Google email added in
                    Employees to use the web app.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <label className="space-y-1 text-xs font-medium">
                    Project name
                    <Input
                      value={projectName || group.title}
                      onChange={(event) => setProjectName(event.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    Start date
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </label>
                  <Button
                    className="self-end"
                    onClick={createProject}
                    disabled={busy || anySaving || Boolean(blocker)}
                  >
                    Finish setup
                  </Button>
                </div>
                {blocker && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {blocker}
                  </p>
                )}
              </div>
            )}
            <details className="card-box">
              <summary className="cursor-pointer text-sm font-semibold">
                Someone missing from the list?
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Telegram does not let the bot list everyone in a group. Ask each missing person to
                  send <code>/join{group.botUsername ? `@${group.botUsername}` : ''}</code> in the
                  group, then press Refresh. Making the bot a group admin lets it see new members on
                  its own.
                </p>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(
                      () =>
                        api('/api/founder/telegram-groups/refresh', 'POST', {
                          groupChatId: group.groupChatId,
                          telegramUserId: memberId,
                        }),
                      'Member verified in Telegram and added to the roster.',
                    ).then(() => setMemberId(''));
                  }}
                >
                  <label className="space-y-1 text-xs font-medium">
                    Or add them by Telegram ID
                    <Input
                      value={memberId}
                      onChange={(event) => setMemberId(event.target.value)}
                      inputMode="numeric"
                      pattern="[0-9]+"
                      required
                      placeholder="Telegram user ID"
                    />
                  </label>
                  <Button variant="outline" disabled={busy || !/^\d+$/.test(memberId)}>
                    Verify and add
                  </Button>
                </form>
                {embedded && (
                  <p className="text-xs text-muted-foreground">
                    Telegram group ID {group.groupChatId}
                    {group.telegramMemberCount
                      ? ` · ${group.telegramMemberCount} Telegram accounts including bots`
                      : ''}
                  </p>
                )}
              </div>
            </details>
          </section>
        </div>
      ) : (
        <Empty
          icon={Users}
          title="No Telegram groups yet"
          description="Create a group in Telegram, add the project bot as an admin, then add your team. The group appears here automatically."
        />
      )}
    </div>
  );
}
