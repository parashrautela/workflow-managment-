import { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function GoogleAccessRequests({ employees, projects, onChanged }) {
  const [accounts, setAccounts] = useState([]),
    [currentId, setCurrentId] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null);
  const load = async () => {
    try {
      const data = await request('/api/founder/google/accounts');
      setAccounts(data.accounts);
      setCurrentId(data.currentAccountId);
      setError('');
    } catch (problem) {
      setError(problem.message);
    }
  };
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);
  const changed = async () => {
    await load();
    await onChanged?.();
  };
  const invite = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      data = Object.fromEntries(new FormData(form));
    setConfirm({ action: 'invite', name: data.name, email: data.email, form });
  };
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await request(
        confirm.action === 'invite'
          ? '/api/founder/google/founders'
          : `/api/founder/google/accounts/${confirm.account.id}/founder`,
        {
          method: 'POST',
          body:
            confirm.action === 'invite'
              ? { name: confirm.name, email: confirm.email }
              : { action: confirm.action },
        },
      );
      confirm.form?.reset();
      setConfirm(null);
      if (result.signedOut) {
        location.assign('/');
        return;
      }
      await changed();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const founders = accounts.filter(
    (account) => account.kind === 'founder' && account.status === 'Approved',
  );
  const requests = accounts.filter(
    (account) => account.kind === 'employee' && account.status !== 'Approved',
  );
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2>Google sign-in & team access</h2>
          <p className="text-xs text-muted-foreground">
            Founders have equal control. Employees see only their assigned projects.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          Refresh requests
        </Button>
      </div>
      <details>
        <summary>Founders · {founders.length}</summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Every founder can manage people, appoint founders and change founder roles. At least one
            founder who has signed in must remain.
          </p>
          {founders.map((account) => (
            <div
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {account.name}
                  {account.id === currentId ? ' · You' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {account.email} ·{' '}
                  {account.claimed ? 'Connected' : 'Pre-approved; awaiting first sign-in'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={account.claimed && founders.filter((row) => row.claimed).length === 1}
                title={
                  account.claimed && founders.filter((row) => row.claimed).length === 1
                    ? 'Add another founder who has signed in first'
                    : undefined
                }
                onClick={() => setConfirm({ account, action: 'revoke' })}
              >
                {account.claimed ? 'Remove founder role' : 'Cancel founder invitation'}
              </Button>
            </div>
          ))}
          <form onSubmit={invite} className="space-y-3 border-t pt-3">
            <p className="text-sm font-medium">Add another founder</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs">
                Full name
                <Input name="name" required maxLength={120} />
              </label>
              <label className="grid gap-1 text-xs">
                Google sign-in email
                <Input
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  placeholder="name@gmail.com"
                />
              </label>
            </div>
            <Button type="submit" variant="outline">
              Pre-approve founder
            </Button>
          </form>
          {accounts.some(
            (account) =>
              account.claimed && account.id !== currentId && account.status === 'Approved',
          ) && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-medium">Transfer my founder role</p>
              <p className="text-xs text-muted-foreground">
                Choose someone who has already signed in. They become a founder; you become an
                employee and are signed out.
              </p>
              {accounts
                .filter(
                  (account) =>
                    account.claimed && account.id !== currentId && account.status === 'Approved',
                )
                .map((account) => (
                  <Button
                    className="mr-2"
                    key={account.id}
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirm({ account, action: 'transfer' })}
                  >
                    Transfer to {account.name}
                  </Button>
                ))}
            </div>
          )}
        </div>
      </details>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          Access requests · {requests.filter((account) => account.status === 'Pending').length}{' '}
          pending
        </h3>
        {requests.map((account) => (
          <AccessRequest
            key={account.id}
            account={account}
            employees={employees}
            projects={projects}
            onChanged={changed}
            onFounder={() => setConfirm({ account, action: 'grant' })}
          />
        ))}
        {!requests.length && (
          <p className="text-sm text-muted-foreground">No pending Google access requests.</p>
        )}
      </div>
      {accounts.some(
        (account) =>
          account.kind === 'employee' && account.status === 'Approved' && account.claimed,
      ) && (
        <details>
          <summary>Manage connected employee roles</summary>
          <div className="mt-3 space-y-2">
            {accounts
              .filter(
                (account) =>
                  account.kind === 'employee' && account.status === 'Approved' && account.claimed,
              )
              .map((account) => (
                <div className="flex flex-wrap items-center justify-between gap-2" key={account.id}>
                  <p className="text-sm">
                    {account.name} · {account.email}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirm({ account, action: 'grant' })}
                  >
                    Make founder
                  </Button>
                </div>
              ))}
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!busy && !open) {
            setConfirm(null);
            setError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.action === 'invite' || confirm?.action === 'grant'
                ? 'Grant full founder access?'
                : confirm?.action === 'transfer'
                  ? 'Transfer your founder role?'
                  : 'Remove founder access?'}
            </DialogTitle>
            <DialogDescription>
              {confirm?.email || confirm?.account?.email}
              {' — '}
              {confirm?.action === 'invite' || confirm?.action === 'grant'
                ? 'This person will have full workspace access, including managing founders and employees.'
                : confirm?.action === 'transfer'
                  ? 'They will have full founder control. You will become an employee with your existing project assignments and be signed out.'
                  : 'Founder sessions will end immediately. A connected person keeps employee access to their assigned projects only.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy} onClick={run}>
              {busy ? 'Saving…' : 'Confirm role change'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function AccessRequest({ account, employees, projects, onChanged, onFounder }) {
  const [employeeId, setEmployeeId] = useState(
      employees.find(
        (employee) => employee.email?.toLowerCase() === account.email && employee.active !== false,
      )?.id || '',
    ),
    [projectIds, setProjectIds] = useState([]),
    [role, setRole] = useState('Designer'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const decide = async (status) => {
    setBusy(true);
    setError('');
    try {
      await request(`/api/founder/google/accounts/${account.id}/decision`, {
        method: 'POST',
        body: { status, employeeId, projectIds, role, designation: role },
      });
      await onChanged();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {account.name} · {account.email}
      </p>
      <p className="text-xs text-muted-foreground">{account.status}</p>
      <label className="grid gap-1 text-xs">
        Employee profile
        <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
          <option value="">Create a new profile</option>
          {employees
            .filter((employee) => employee.active !== false && !employee.googleLinked)
            .map((employee) => (
              <option value={employee.id} key={employee.id}>
                {employee.name} · {employee.id}
              </option>
            ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs">
        Role / designation
        <Input value={role} maxLength={120} onChange={(event) => setRole(event.target.value)} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium">Assigned projects</legend>
        {projects
          .filter((project) => !['Completed', 'Abandoned'].includes(project.status))
          .map((project) => (
            <label className="flex items-center gap-2 text-sm" key={project.id}>
              <input
                type="checkbox"
                checked={projectIds.includes(project.id)}
                onChange={(event) =>
                  setProjectIds(
                    event.target.checked
                      ? [...projectIds, project.id]
                      : projectIds.filter((id) => id !== project.id),
                  )
                }
              />
              {project.name}
            </label>
          ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !role.trim()} onClick={() => decide('Approved')}>
          Approve employee
        </Button>
        <Button disabled={busy} variant="outline" onClick={onFounder}>
          Assign founder role
        </Button>
        <Button
          disabled={busy || account.status === 'Rejected'}
          variant="outline"
          onClick={() => decide('Rejected')}
        >
          Reject
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
