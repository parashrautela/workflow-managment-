import { GoogleAccessRequests } from '../auth/GoogleAccessRequests';
import { matchesRole } from '@/features/people/lib/roles';
import { useEffect, useState } from 'react';
import { Check, Copy, Pencil, UserPlus, Users, UserX, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { disableEmployee, enableEmployee, updateEmployee, request } from '@/lib/api';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Empty } from '@/components/ui/empty';
const roles = [
  'Designer',
  'Site supervisor',
  'Project admin',
  'Site team',
  'Contractor',
  'Trade worker',
  'Other',
];

export function EditEmployeeDialog({ employee, onOpenChange, onUpdated }) {
  const [form, setForm] = useState({ name: '', designation: '', email: '', phone: '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (employee) {
      setForm({
        name: employee.name,
        designation: employee.designation,
        email: employee.email || '',
        phone: employee.phone || '',
      });
      setError('');
    }
  }, [employee]);
  const field = (key) => ({
    value: form[key],
    onChange: (event) => setForm({ ...form, [key]: event.target.value }),
  });
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateEmployee(employee.id, form);
      await onUpdated?.();
      onOpenChange(false);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={Boolean(employee)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {employee?.name}</DialogTitle>
          <DialogDescription>
            Keep their existing projects and history. Changing the Google email revokes the old
            account’s access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <label className="grid gap-1 text-xs">
            Full name
            <Input required maxLength={120} {...field('name')} />
          </label>
          <label className="grid gap-1 text-xs">
            Designation
            <Input required maxLength={120} {...field('designation')} />
          </label>
          <label className="grid gap-1 text-xs">
            Google sign-in email
            <Input
              type="email"
              required
              readOnly={employee?.workspaceRole === 'Founder'}
              maxLength={200}
              {...field('email')}
            />
            <span className="text-muted-foreground">
              Use the exact Gmail or Google Workspace email they will sign in with. Saving
              pre-approves their access.
            </span>
          </label>
          <label className="grid gap-1 text-xs">
            Phone (optional)
            <Input type="tel" maxLength={40} {...field('phone')} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save profile and access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onUpdated,
  label = 'Add employee',
}) {
  const [projectId, setProjectId] = useState(''),
    [access, setAccess] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId || projects[0]?.id || '');
      setAccess(null);
      setError('');
      setCopied(false);
    }
  }, [open, defaultProjectId]);
  const submit = async (event, existing) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await request(
        existing ? `/api/founder/projects/${projectId}/employees` : '/api/founder/employees',
        { method: 'POST', body: existing ? data : { ...data, projectId } },
      );
      await onUpdated?.();
      if (existing) onOpenChange(false);
      else setAccess(result.access);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Studio Iksha access\n${location.origin}/employee\nSign in with Google: ${access.email}`,
      );
      setCopied(true);
    } catch {
      setError('Could not copy. Copy the email and link shown here.');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{access ? 'Employee access is ready' : label}</DialogTitle>
          <DialogDescription>
            {access
              ? 'They can sign in immediately with this Google account.'
              : 'Pre-approve their Google email and choose their first project.'}
          </DialogDescription>
        </DialogHeader>
        {access ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{access.email}</p>
            <Input
              readOnly
              aria-label="Employee sign-in link"
              value={`${location.origin}/employee`}
            />
            <p className="text-xs text-muted-foreground">
              Use Continue with Google. Only assigned projects are visible; there is no approval
              wait or password.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button onClick={copy}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy sign-in details'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="grid gap-1 text-xs">
              Project
              <NativeSelect
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Choose a project…</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Tabs defaultValue="new">
              <TabsList className="w-full">
                <TabsTrigger value="new">New employee</TabsTrigger>
                <TabsTrigger value="existing">Existing employee</TabsTrigger>
              </TabsList>
              <TabsContent value="new">
                <form onSubmit={(event) => submit(event, false)} className="space-y-3">
                  <label className="grid gap-1 text-xs">
                    Full name
                    <Input name="name" required maxLength={120} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Designation
                    <Input
                      name="designation"
                      required
                      maxLength={120}
                      placeholder="Interior designer"
                    />
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
                    <span className="text-muted-foreground">
                      The exact Gmail or Google Workspace account they will use.
                    </span>
                  </label>
                  <label className="grid gap-1 text-xs">
                    Phone (optional)
                    <Input name="phone" type="tel" maxLength={40} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Project role
                    <NativeSelect name="role">
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </NativeSelect>
                  </label>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={busy || !projectId}>
                      {busy
                        ? 'Saving…'
                        : label === 'Add employee'
                          ? 'Add employee and approve access'
                          : label}
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
              <TabsContent value="existing">
                <form onSubmit={(event) => submit(event, true)} className="space-y-3">
                  <label className="grid gap-1 text-xs">
                    Employee ID
                    <Input name="employeeId" required placeholder="EMP-XXXXXXXXXX" />
                  </label>
                  <label className="grid gap-1 text-xs">
                    Project role
                    <NativeSelect name="role">
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </NativeSelect>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Their Google login stays the same. This adds the selected project to their
                    access.
                  </p>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button disabled={busy || !projectId} type="submit">
                      Assign to project
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeManager({ employees, projects, onAdd, onUpdated, onViewWork }) {
  const [roleFilter, setRoleFilter] = useState('All');
  const visibleEmployees = employees.filter(
    (employee) =>
      roleFilter === 'All' ||
      matchesRole(employee.designation, roleFilter) ||
      projects.some((project) =>
        project.members?.some(
          (member) =>
            member.employeeId === employee.id &&
            matchesRole(member.roles || member.role, roleFilter),
        ),
      ),
  );
  const [updatingId, setUpdatingId] = useState(null);
  const [confirmEmployee, setConfirmEmployee] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [error, setError] = useState('');

  const handleAccessChange = async () => {
    if (!confirmEmployee) return;
    setUpdatingId(confirmEmployee.id);
    setError('');
    try {
      await (confirmEmployee.active === false ? enableEmployee : disableEmployee)(
        confirmEmployee.id,
      );
      setConfirmEmployee(null);
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update employee access.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team accounts, active projects, and revoke access when necessary.
          </p>
        </div>
        <Button onClick={onAdd} disabled={!projects.length}>
          <UserPlus className="size-4 mr-2" />
          Add employee
        </Button>
      </div>

      {error && (
        <div className="card-box border-destructive/30 bg-destructive/10 text-xs text-destructive">
          {error}
        </div>
      )}

      <GoogleAccessRequests employees={employees} projects={projects} onChanged={onUpdated} />
      <SegmentedControl
        label="Filter employees by role"
        value={roleFilter}
        onValueChange={setRoleFilter}
        options={[
          { value: 'All', label: 'All employees' },
          { value: 'Designer', label: 'Designers' },
          { value: 'Site Supervisor', label: 'Site supervisors' },
        ]}
      />
      {employees.length ? (
        <ul className="m-0 grid list-none gap-3 p-0">
          {visibleEmployees.map((employee) => {
            const isActive = employee.active !== false;
            const googleStatus =
              employee.workspaceRole === 'Founder'
                ? 'Founder'
                : employee.googleLinked
                  ? 'Google connected'
                  : employee.googleInvited
                    ? 'Google pre-approved'
                    : 'Add Google email';
            const projectNames = (employee.projectIds || [])
              .map((id) => projects.find((project) => project.id === id)?.name || 'Project')
              .join(', ');
            const details = [
              googleStatus,
              employee.telegramConnected ? 'Telegram connected' : 'Telegram not started',
              employee.email,
              employee.phone,
              projectNames || 'No active projects',
            ].filter(Boolean);

            return (
              <li
                key={employee.id}
                className={`flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-3 ${!isActive ? 'border-dashed bg-muted/40' : ''}`}
              >
                <div className="min-w-0 flex-1 basis-60">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <h2 className="truncate type-heading-16">{employee.name}</h2>
                    <span className="truncate text-sm text-muted-foreground">
                      {employee.designation}
                    </span>
                    {!isActive && (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 bg-destructive/10 text-destructive text-xs"
                      >
                        Revoked
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={details.join(' · ')}>
                    {details.join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onViewWork?.(employee)}>
                    Pending work
                  </Button>
                  {!isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmEmployee(employee)}
                    >
                      Restore access
                    </Button>
                  )}
                  {isActive && employee.workspaceRole !== 'Founder' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditEmployee(employee)}
                        aria-label={`Edit ${employee.name}`}
                      >
                        <Pencil className="size-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive-ghost"
                        size="sm"
                        onClick={() => setConfirmEmployee(employee)}
                      >
                        <UserX className="size-3.5 mr-1" />
                        Revoke
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          kind={employees.length ? 'no-results' : 'first-use'}
          icon={Users}
          title={employees.length ? 'No employees match this filter' : 'No employee accounts yet'}
          description={
            employees.length
              ? 'Try another role.'
              : 'Add a team member’s Google email to pre-approve their access.'
          }
          action={
            employees.length ? (
              <Button variant="outline" size="sm" onClick={() => setRoleFilter('All')}>
                Show all employees
              </Button>
            ) : null
          }
        />
      )}

      <EditEmployeeDialog
        employee={editEmployee}
        onOpenChange={(open) => {
          if (!open) setEditEmployee(null);
        }}
        onUpdated={onUpdated}
      />

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!confirmEmployee} onOpenChange={() => setConfirmEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmEmployee?.active === false ? 'Restore' : 'Revoke'} {confirmEmployee?.name}'s
              access?
            </DialogTitle>
            <DialogDescription>
              {confirmEmployee?.active === false
                ? 'Reactivate this existing employee profile so it can be assigned a Telegram project role again. Previously approved Google login and existing project memberships become available again. Cleared task assignments and old sessions are not restored.'
                : 'This will immediately end their staff sessions, block future staff logins, and clear their task assignments. You can restore access later; cleared task assignments will need to be assigned again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmEmployee(null)}
              disabled={Boolean(updatingId)}
            >
              Cancel
            </Button>
            <Button
              variant={confirmEmployee?.active === false ? 'default' : 'destructive'}
              onClick={handleAccessChange}
              disabled={Boolean(updatingId)}
            >
              {updatingId ? <Loader2 className="size-3.5 animate-spin mr-2" /> : null}
              {confirmEmployee?.active === false ? 'Restore access' : 'Confirm revocation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
