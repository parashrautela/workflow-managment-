import { useEffect, useState } from "react";
import { Check, Copy, UserPlus, Users, UserX, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { disableEmployee } from "@/lib/api";

const roles = ["Project admin", "Designer", "Site supervisor", "Site team", "Contractor", "Trade worker", "Other"];

export function EmployeeDialog({ open, onOpenChange, projects, defaultProjectId, onUpdated }) {
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [credentials, setCredentials] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId || projects[0]?.id || "");
      setCredentials(null);
      setError("");
      setCopied(false);
    }
  }, [open, defaultProjectId, projects]);

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
              ? "Copy these details now. The password is shown only once."
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
              Share the password privately with the employee. It cannot be viewed again after closing this window.
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

export function EmployeeManager({ employees, projects, onAdd, onUpdated }) {
  const [disablingId, setDisablingId] = useState(null);
  const [confirmEmployee, setConfirmEmployee] = useState(null);
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

      {employees.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {employees.map((employee) => {
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 text-xs h-7 px-2"
                        onClick={() => setConfirmEmployee(employee)}
                      >
                        <UserX className="size-3.5 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>

                  <p className="font-mono text-xs text-muted-foreground">{employee.id}</p>

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
