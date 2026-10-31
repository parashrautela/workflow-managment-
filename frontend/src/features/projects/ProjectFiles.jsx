import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api';

export function ProjectFiles({ projectId, namespace = 'founder' }) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const load = useCallback(
    async (signal, background = false) => {
      const current = ++requestId.current;
      if (!background) setLoading(true);
      try {
        const data = await request('/api/' + namespace + '/projects/' + projectId + '/files', {
          signal,
        });
        if (current !== requestId.current || signal?.aborted) return;
        setFiles(data.files || []);
        setError('');
      } catch (problem) {
        if (current === requestId.current && !signal?.aborted)
          setError(problem.message || 'Could not load the project files.');
      } finally {
        if (current === requestId.current && !signal?.aborted) setLoading(false);
      }
    },
    [projectId, namespace],
  );
  useEffect(() => {
    const controller = new AbortController();
    setFiles([]);
    setError('');
    void load(controller.signal);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal, true);
    }, 10000);
    return () => {
      controller.abort();
      requestId.current++;
      clearInterval(timer);
    };
  }, [load]);
  return (
    <section className="iksha-project-files">
      <header>
        <div>
          <h2>Project documents & photos</h2>
          <p>Files shared in the Telegram group. Saved files can be opened below.</p>
        </div>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={'size-4 ' + (loading ? 'animate-spin' : '')} />
          Refresh files
        </Button>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && !files.length ? (
        <p role="status">Loading files…</p>
      ) : files.length ? (
        files.map((file) => (
          <article className="iksha-file-card" key={file.id}>
            <FileText size={19} />
            <div>
              <strong>{file.name || 'Untitled file'}</strong>
              <p>
                {file.submittedBy || 'Team member'} ·{' '}
                {file.status === 'Stored'
                  ? 'Saved to Google Drive'
                  : 'Waiting for Google Drive save'}
              </p>
              {file.submittedAt && (
                <time>
                  {new Date(file.submittedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              )}
              {file.error && <p className="iksha-file-error">{file.error}</p>}
            </div>
            {file.status === 'Stored' && (
              <a
                href={
                  '/api/' +
                  namespace +
                  '/projects/' +
                  projectId +
                  '/files/' +
                  encodeURIComponent(file.id)
                }
                target="_blank"
                rel="noreferrer"
              >
                Open file <ExternalLink size={13} />
              </a>
            )}
          </article>
        ))
      ) : (
        !error && (
          <p className="iksha-files-empty">
            No files have been shared yet. Send photos or documents in the project’s Telegram group
            to add them here.
          </p>
        )
      )}
    </section>
  );
}
