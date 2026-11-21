import { useEffect, useState } from 'react';
import { ExternalLink, FolderOpen, HardDrive } from 'lucide-react';
import { request } from '@/lib/api';
import { loadGoogle } from '@/features/auth/GoogleSignIn';
import { folderIdFrom } from '@/features/drive/lib/driveLink';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { StatusChip } from '@/components/ui/status-chip';
import { Time } from '@/components/ui/time';
import { toast } from '@/components/ui/toaster';

const FOLDER_TYPE = 'application/vnd.google-apps.folder';
let pickerScript;
// Google's folder picker, loaded on first use.
function loadPicker() {
  pickerScript ||= new Promise((resolve, reject) => {
    const failed = () => {
      script.remove();
      pickerScript = null;
      reject(Error('Google’s folder picker could not load. Try again.'));
    };
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () =>
      window.gapi.load('picker', { callback: () => resolve(window.google.picker), onerror: failed });
    script.onerror = failed;
    document.head.appendChild(script);
  });
  return pickerScript;
}

// Resolves with the chosen folder id, or null when the picker is closed. Choosing it is what gives Iksha access.
async function chooseFolder({ accessToken, pickerKey, appId, folderId }) {
  const picker = await loadPicker();
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_TYPE);
    // A pasted link opens on just that folder, so one click confirms it.
    if (folderId && view.setFileIds) view.setFileIds(folderId);
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(pickerKey)
      .setAppId(appId)
      .setTitle('Choose the folder for Iksha')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id || null);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

const choices = [
  {
    id: 'create',
    title: 'Create a new “Iksha Studio” folder',
    text: 'Iksha makes the folder in your Drive and keeps each project in its own folder inside it.',
  },
  {
    id: 'pick',
    title: 'Choose a folder from my Drive',
    text: 'Pick a folder you already use in Google’s folder picker.',
    needsPicker: true,
  },
  {
    id: 'paste',
    title: 'Paste a folder link',
    text: 'Paste the link from Drive’s address bar, then confirm it once in Google.',
    needsPicker: true,
  },
];
const actionLabel = { create: 'Create folder', pick: 'Choose in Google', paste: 'Confirm in Google' };

function FolderChoice({ drive, busy, problem, onSave, onCancel }) {
  const [choice, setChoice] = useState(drive.connection.folder ? 'pick' : 'create');
  const [link, setLink] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where should files go?</CardTitle>
        <CardDescription>Connected as {drive.connection.email}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2" role="radiogroup" aria-label="Drive folder">
          {choices.map((option) => {
            const off = option.needsPicker && !drive.picker;
            return (
              <label
                key={option.id}
                className={`card-box ${choice === option.id ? 'border-primary bg-primary/5' : ''} ${off ? 'opacity-50' : 'cursor-pointer'}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="drive-folder"
                    disabled={off}
                    checked={choice === option.id}
                    onChange={() => setChoice(option.id)}
                  />
                  {option.title}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {off ? 'Needs GOOGLE_PICKER_API_KEY on the server.' : option.text}
                </span>
              </label>
            );
          })}
        </div>
        {choice === 'paste' && (
          <Input
            autoFocus
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            aria-label="Drive folder link"
          />
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button disabled={busy} onClick={() => onSave(choice, link)}>
            {busy ? 'Saving…' : actionLabel[choice]}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, children, action }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 basis-48 text-sm break-words">{children}</div>
      {action}
    </div>
  );
}

const counts = (row) =>
  [
    `${row.saved} saved`,
    row.waiting && `${row.waiting} waiting`,
    row.problems && `${row.problems} need attention`,
  ]
    .filter(Boolean)
    .join(' · ');

function Connected({ drive, onChange, onDisconnect }) {
  const { connection, totals, projects, problems } = drive;
  const { folder } = connection;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row
            label="Account"
            action={
              <Button variant="destructive-outline" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            }
          >
            <span className="font-medium">{connection.email}</span>
            <span className="text-muted-foreground">
              {' '}
              · Connected <Time value={connection.connectedAt} format="date" />
            </span>
          </Row>
          <Row
            label="Folder"
            action={
              <Button variant="outline" size="sm" onClick={onChange}>
                Change folder
              </Button>
            }
          >
            <a
              href={folder.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              {folder.name}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </Row>
          <Row label="Status">
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="success">{totals.saved} saved</StatusChip>
              <StatusChip tone="neutral">{totals.waiting} waiting</StatusChip>
              {totals.problems > 0 && (
                <StatusChip tone="warning">{totals.problems} need attention</StatusChip>
              )}
            </div>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Files shared in each project and where they stand.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {projects.length ? (
            projects.map((project) => (
              <div
                key={project.id}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {project.url ? (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 basis-40 truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium">
                    {project.name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {project.lastAt ? counts(project) : 'No files yet'}
                </span>
                {project.lastAt && (
                  <Time value={project.lastAt} className="text-xs text-muted-foreground" />
                )}
              </div>
            ))
          ) : (
            <Empty
              className="border-0"
              icon={FolderOpen}
              title="No projects yet"
              description="Projects appear here with their files once they are set up."
            />
          )}
        </CardContent>
      </Card>

      {problems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files that didn’t save</CardTitle>
            <CardDescription>
              Iksha keeps retrying. Files over 20 MB can’t be fetched from Telegram, so ask for a
              smaller copy.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {problems.map((file) => (
              <div key={file.id} className="py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {file.project}
                    {file.at && (
                      <>
                        {' · '}
                        <Time value={file.at} />
                      </>
                    )}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{file.error}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Who can open these folders</CardTitle>
          <CardDescription>
            Only {connection.email}. Your team keeps using Files in each project. To give someone
            access in Drive, share the folder with them there.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" asChild>
            <a href={folder.url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Manage sharing in Drive
            </a>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export function GoogleDrive() {
  const [drive, setDrive] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [changing, setChanging] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = async () => {
    try {
      setDrive(await request('/api/founder/drive'));
      setLoadError('');
    } catch (error) {
      setLoadError(error.message || 'Could not load the Google Drive connection.');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const connected = Boolean(drive?.connection);
  // Load Google's script early: a popup opened after a wait gets blocked by the browser.
  useEffect(() => {
    if (drive?.ready && !connected) loadGoogle().catch(() => {});
  }, [drive?.ready, connected]);

  const connect = async () => {
    setBusy('connect');
    try {
      await loadGoogle();
      const code = await new Promise((resolve, reject) => {
        window.google.accounts.oauth2
          .initCodeClient({
            client_id: drive.clientId,
            scope: drive.scope,
            ux_mode: 'popup',
            callback: (response) =>
              response.code
                ? resolve(response.code)
                : reject(Error('Google sign-in didn’t finish. Try again.')),
            error_callback: () => reject(Error('Google sign-in closed before it finished.')),
          })
          .requestCode();
      });
      const result = await request('/api/founder/drive/connect', {
        method: 'POST',
        body: { code },
      });
      setDrive(result);
      toast(`Connected ${result.connection.email}`);
    } catch (error) {
      toast(error.message || 'Could not connect Google Drive.', { error: true });
    } finally {
      setBusy('');
    }
  };

  const saveFolder = async (choice, link) => {
    setBusy('folder');
    setProblem('');
    try {
      let input = { create: true };
      if (choice !== 'create') {
        const pasted = choice === 'paste' ? folderIdFrom(link) : '';
        if (choice === 'paste' && !pasted)
          throw Error('Paste a Drive folder link, like drive.google.com/drive/folders/…');
        const { accessToken } = await request('/api/founder/drive/token', {
          method: 'POST',
          body: {},
        });
        const folderId = await chooseFolder({
          accessToken,
          pickerKey: drive.pickerKey,
          appId: drive.appId,
          folderId: pasted,
        });
        if (!folderId) return;
        input = { folderId, how: choice };
      }
      const result = await request('/api/founder/drive/folder', { method: 'POST', body: input });
      setDrive(result);
      setChanging(false);
      toast(`Files will go to ${result.connection.folder.name}`);
    } catch (error) {
      setProblem(error.message || 'Could not save the folder.');
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    try {
      setDrive(await request('/api/founder/drive/disconnect', { method: 'POST', body: {} }));
      setConfirmOff(false);
      setChanging(false);
      toast('Google Drive disconnected');
    } catch (error) {
      toast(error.message || 'Could not disconnect Google Drive.', { error: true });
    } finally {
      setBusy('');
    }
  };

  const connection = drive?.connection;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1>Google Drive</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Back up every project photo, document and video to your Drive.
          </p>
        </div>
        {connection?.folder && !changing && <RefreshButton onRefresh={load} />}
      </div>

      {!drive ? (
        loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        )
      ) : !drive.ready ? (
        <Alert>
          <HardDrive />
          <AlertTitle>Google Drive isn’t set up on the server yet</AlertTitle>
          <AlertDescription>
            Add GOOGLE_CLIENT_SECRET to the server, and GOOGLE_PICKER_API_KEY to choose or paste a
            folder, then refresh this page.
          </AlertDescription>
        </Alert>
      ) : !connection ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect Google Drive</CardTitle>
            <CardDescription>
              Choose the Google account whose Drive should hold the files. Iksha can only see the
              files it saves there, never the rest of your Drive.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button disabled={busy === 'connect'} onClick={connect}>
              <HardDrive />
              {busy === 'connect' ? 'Connecting…' : 'Connect Google Drive'}
            </Button>
          </CardContent>
        </Card>
      ) : !connection.folder || changing ? (
        <FolderChoice
          drive={drive}
          busy={busy === 'folder'}
          problem={problem}
          onSave={saveFolder}
          onCancel={
            connection.folder
              ? () => {
                  setChanging(false);
                  setProblem('');
                }
              : null
          }
        />
      ) : (
        <Connected
          drive={drive}
          onChange={() => setChanging(true)}
          onDisconnect={() => setConfirmOff(true)}
        />
      )}

      <Dialog open={confirmOff} onOpenChange={setConfirmOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Drive?</DialogTitle>
            <DialogDescription>
              New files wait in Iksha until you connect again. Files already saved stay in{' '}
              {connection?.email}’s Drive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOff(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy === 'disconnect'} onClick={disconnect}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
