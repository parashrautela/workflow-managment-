import {GoogleAccessRequests} from './GoogleAccessRequests';
import { matchesRole } from '@/lib/roles';
import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, UserPlus, Users, UserX, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { disableEmployee, setEmployeePassword, updateEmployee } from "@/lib/api";

const roles = ["Project admin", "Designer", "Site supervisor", "Site team", "Contractor", "Trade worker", "Other"];

// Password input with show/hide. Blank means the system generates a strong password.
function PasswordField({ name = "password", value, onChange, placeholder = "Leave blank to generate one", autoComplete = "new-password" }) {
  const [visible, setVisible] = useState(false);
  return <span className="relative block">
    <Input name={name} type={visible ? "text" : "password"} minLength={8} maxLength={128} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={onChange} className="pr-10" />
    <button type="button" onClick={() => setVisible((current) => !current)} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground" aria-label={visible ? "Hide password" : "Show password"}>
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  </span>;
}

// Login details shown after setting a password, with one-tap copy.
function CredentialsPanel({ credentials, note }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Studio Iksha employee access\nLink: ${credentials.link}\nEmployee ID: ${credentials.employeeId}\nPassword: ${credentials.password}`);
      setCopied(true);
    } catch {
      setError("Could not copy. Select and copy the details below.");
    }
  };
  return <div className="space-y-3">
    <label className="grid gap-1 text-xs font-medium">Employee login link<Input value={credentials.link} readOnly className="font-mono text-xs" /></label>
    <label className="grid gap-1 text-xs font-medium">Employee ID<Input value={credentials.employeeId} readOnly className="font-mono" /></label>
    <label className="grid gap-1 text-xs font-medium">Password<Input value={credentials.password} readOnly className="font-mono" /></label>
    <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{note}</p>
    <Button type="button" className="h-11 w-full" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy link and credentials"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

// Edit an employee: profile details, and set or reset their password at any time.
export function EditEmployeeDialog({ employee, onOpenChange, onUpdated }) {
  const [form, setForm] = useState({ name: "", designation: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (employee) {
      setForm({ name: employee.name || "", designation: employee.designation || "", email: employee.email || "", phone: employee.phone || "" });
      setPassword(""); setCredentials(null); setError(""); setSaved(false); setBusy("");
    }
  }, [employee]);

  const field = (key) => ({ value: form[key], onChange: (event) => { setSaved(false); setForm((current) => ({ ...current, [key]: event.target.value })); } });
  const saveProfile = async (event) => {
    event.preventDefault();
    setBusy("profile"); setError("");
    try {
      await updateEmployee(employee.id, form);
      setSaved(true);
      await onUpdated?.();
    } catch (problem) {
      setError(problem.message || "Could not save the profile.");
    } finally {
      setBusy("");
    }
  };
  const savePassword = async (generate) => {
    if (!generate && password.length < 8) { setError("Use at least 8 characters, or choose Generate new."); return; }
    setBusy(generate ? "generate" : "password"); setError("");
    try {
      const result = await setEmployeePassword(employee.id, generate ? "" : password);
      setCredentials(result.credentials);
      setPassword("");
    } catch (problem) {
      setError(problem.message || "Could not set the password.");
    } finally {
      setBusy("");
    }
  };

  return <Dialog open={Boolean(employee)} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{credentials ? "New password is ready" : `Edit ${employee?.name || "employee"}`}</DialogTitle>
        <DialogDescription>{credentials ? "Share these details privately. The employee has been signed out of every device." : <>Employee ID <span className="font-mono">{employee?.id}</span> stays the same.</>}</DialogDescription>
      </DialogHeader>
      {credentials ? <>
        <CredentialsPanel credentials={credentials} note="The previous password no longer works. If this one gets lost, set a new one any time from Edit." />
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
      </> : <div className="space-y-5">
        <form onSubmit={saveProfile} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Profile</p>
          <label className="grid gap-1 text-xs font-medium">Full name<Input required maxLength={120} {...field("name")} /></label>
          <label className="grid gap-1 text-xs font-medium">Designation<Input required maxLength={120} {...field("designation")} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-medium">Email (optional)<Input type="email" maxLength={200} placeholder="name@example.com" {...field("email")} /></label>
            <label className="grid gap-1 text-xs font-medium">Phone (optional)<Input type="tel" maxLength={40} placeholder="+91…" {...field("phone")} /></label>
          </div>
          <Button type="submit" className="h-11 w-full" disabled={Boolean(busy)}>{busy === "profile" ? "Saving…" : saved ? <><Check />Saved</> : "Save profile"}</Button>
        </form>
        <div className="space-y-3 border-t pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><KeyRound className="size-3.5" />Password</p>
          <p className="text-xs text-muted-foreground">Set a password you choose, or generate a strong one. Either way the employee is signed out everywhere and must use the new password.</p>
          <PasswordField value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password (8+ characters)" />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="h-11" disabled={Boolean(busy) || !password} onClick={() => savePassword(false)}>{busy === "password" ? "Setting…" : "Set this password"}</Button>
            <Button type="button" variant="outline" className="h-11" disabled={Boolean(busy)} onClick={() => savePassword(true)}>{busy === "generate" ? "Generating…" : "Generate new"}</Button>
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>}
    </DialogContent>
  </Dialog>;
}

export function EmployeeDialog({ open, onOpenChange, projects, defaultProjectId, onUpdated }) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Reset only when the dialog opens. Saving reloads the project list, and resetting on that would wipe the
  // login details screen a moment after it appears.
  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId || projects[0]?.id || "");
      setCredentials(null);
      setError("");
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && !projects.some((project) => project.id === projectId)) setProjectId(defaultProjectId || projects[0]?.id || "");
  }, [open, defaultProjectId, projects, projectId]);

  const submit = async (event, existing) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const url = existing ? `/api/founder/projects/${projectId}/employees` : "/api/founder/employees";
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(existing ? data : { ...data, projectId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save employee.");
      await onUpdated();
      if (existing) onOpenChange(false);
      else setCredentials(result.credentials);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Studio Iksha employee access\nLink: ${credentials.link}\nEmployee ID: ${credentials.employeeId}\nPassword: ${credentials.password}`);
      setCopied(true);
    } catch {
      setError("Could not copy. Select and copy the details below.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{credentials ? "Employee access is ready" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {credentials
              ? "Copy these details now and share them privately."
              : "Give an employee access to one project, or assign an existing employee ID to another."}
          </DialogDescription>
        </DialogHeader>

        {credentials ? (
          <div className="space-y-3">
            <label className="grid gap-1 text-xs font-medium">
              Employee login link
              <Input value={credentials.link} readOnly className="font-mono text-xs" />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Employee ID
              <Input value={credentials.employeeId} readOnly className="font-mono" />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Password
              <Input value={credentials.password} readOnly className="font-mono" />
            </label>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Share the password privately with the employee. If it gets lost, set a new one from Edit on their card.
            </p>
            <Button className="h-11 w-full" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link and credentials"}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.length ? (
              <label className="grid gap-1.5 text-sm font-medium">
                Project
                <NativeSelect value={projectId} onChange={(event) => setProjectId(event.target.value)} className="w-full">
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </NativeSelect>
              </label>
            ) : (
              <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                Create a project before adding employees.
              </p>
            )}

            <Tabs defaultValue="new" className="gap-4">
              <TabsList className="w-full">
                <TabsTrigger value="new">New employee</TabsTrigger>
                <TabsTrigger value="existing">Existing ID</TabsTrigger>
              </TabsList>

              <TabsContent value="new">
                <form onSubmit={(event) => submit(event, false)} className="space-y-3">
                  <label className="grid gap-1 text-xs font-medium">
                    Full name
                    <Input name="name" required maxLength={120} placeholder="Aarav Sharma" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Designation
                    <Input name="designation" required maxLength={120} placeholder="Interior designer" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-xs font-medium">
                      Email (optional)
                      <Input name="email" type="email" maxLength={200} placeholder="name@example.com" />
                    </label>
                    <label className="grid gap-1 text-xs font-medium">
                      Phone (optional)
                      <Input name="phone" type="tel" maxLength={40} placeholder="+91…" />
                    </label>
                  </div>
                  <label className="grid gap-1 text-xs font-medium">
                    Project role
                    <NativeSelect name="role" className="w-full">
                      {roles.map((role) => <option key={role}>{role}</option>)}
                    </NativeSelect>
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Password (optional)
                    <PasswordField />
                    <span className="font-normal text-muted-foreground">Choose one (8+ characters) or leave blank and we'll generate a strong one. You can change it later from Edit.</span>
                  </label>
                  <Button type="submit" className="h-11 w-full" disabled={busy || !projectId}>
                    {busy ? "Creating access…" : "Create employee access"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="existing">
                <form onSubmit={(event) => submit(event, true)} className="space-y-3">
                  <label className="grid gap-1 text-xs font-medium">
                    Existing employee ID
                    <Input name="employeeId" required placeholder="EMP-XXXXXXXXXX" autoCapitalize="characters" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium">
                    Role on this project
                    <NativeSelect name="role" className="w-full">
                      {roles.map((role) => <option key={role}>{role}</option>)}
                    </NativeSelect>
                  </label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    The employee keeps the same login ID and password. This project appears in their workspace after assignment.
                  </p>
                  <Button type="submit" className="h-11 w-full" disabled={busy || !projectId}>
                    {busy ? "Assigning…" : "Assign to project"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeManager({ employees, projects, onAdd, onUpdated, onViewWork }) {
  const [roleFilter,setRoleFilter]=useState("All");
  const visibleEmployees=employees.filter(employee=>roleFilter==="All" || matchesRole(employee.designation,roleFilter) || projects.some(project=>project.members?.some(member=>member.employeeId===employee.id && matchesRole(member.roles || member.role,roleFilter))));
  const [disablingId, setDisablingId] = useState(null);
  const [confirmEmployee, setConfirmEmployee] = useState(null);
  const [editEmployee, setEditEmployee] = useState(null);
  const [error, setError] = useState("");

  const handleDisable = async () => {
    if (!confirmEmployee) return;
    setDisablingId(confirmEmployee.id);
    setError("");
    try {
      await disableEmployee(confirmEmployee.id);
      setConfirmEmployee(null);
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || "Failed to disable employee.");
    } finally {
      setDisablingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Team access</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Employees</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team accounts, active projects, and revoke access when necessary.
          </p>
        </div>
        <Button onClick={onAdd} disabled={!projects.length}>
          <UserPlus className="size-4 mr-1.5" />
          Add employee
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <GoogleAccessRequests employees={employees} projects={projects} onChanged={onUpdated}/>
      <div className="flex gap-2">{['All','Designer','Site Supervisor'].map(role=><Button key={role} variant={roleFilter===role?'default':'outline'} size="sm" onClick={()=>setRoleFilter(role)}>{role==='All'?'All employees':role==='Designer'?'Designers':'Site supervisors'}</Button>)}</div>
      {employees.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleEmployees.map((employee) => {
            const isActive = employee.active !== false;

            return (
              <Card key={employee.id} className={!isActive ? "opacity-60 bg-muted/40 border-dashed" : ""}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Users className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-sm font-semibold">{employee.name}</h2>
                          {!isActive && (
                            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px]">
                              Revoked
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{employee.designation}</p>
                      </div>
                    </div>

                    {isActive && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setEditEmployee(employee)} aria-label={`Edit ${employee.name}`}>
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 text-xs h-8 px-2"
                          onClick={() => setConfirmEmployee(employee)}
                        >
                          <UserX className="size-3.5 mr-1" />
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>

                  <p className="font-mono text-xs text-muted-foreground">{employee.id}</p><p className="text-xs text-muted-foreground">Telegram digest: {employee.telegramConnected?'Connected':'Awaiting Start in bot'}</p><Button variant="outline" size="sm" onClick={()=>onViewWork?.(employee)}>View pending work</Button>
                  {(employee.email || employee.phone) && <p className="text-xs text-muted-foreground">{[employee.email, employee.phone].filter(Boolean).join(" · ")}</p>}

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {employee.projectIds?.length ? (
                      employee.projectIds.map((id) => (
                        <Badge key={id} variant="secondary" className="text-[11px]">
                          {projects.find((project) => project.id === id)?.name || "Project"}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No active projects</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto size-9 text-muted-foreground/50" />
            <h2 className="mt-3 text-sm font-semibold">No employee accounts yet</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a team member to generate their login link and credentials.
            </p>
          </CardContent>
        </Card>
      )}

      <EditEmployeeDialog employee={editEmployee} onOpenChange={(open) => { if (!open) setEditEmployee(null); }} onUpdated={onUpdated} />

      {/* Revocation Confirmation Dialog */}
      <Dialog open={!!confirmEmployee} onOpenChange={() => setConfirmEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {confirmEmployee?.name}'s Access?</DialogTitle>
            <DialogDescription>
              This will immediately terminate all active sessions for {confirmEmployee?.id}, block future logins, and clear their assigned tasks. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmEmployee(null)} disabled={Boolean(disablingId)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisable} disabled={Boolean(disablingId)}>
              {disablingId ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Confirm Revocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
