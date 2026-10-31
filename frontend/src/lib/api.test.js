import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from './api.js';
test('a failed Google sign-in does not expire an existing workspace session', async (t) => {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  let expired = 0;
  globalThis.fetch = async () => Response.json({ error: 'Sign-in expired' }, { status: 401 });
  globalThis.window = {
    dispatchEvent: () => {
      expired++;
    },
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  await assert.rejects(
    request('/api/auth/google/sign-in', { method: 'POST', body: {} }),
    /Sign-in expired/,
  );
  assert.equal(expired, 0);
  await assert.rejects(request('/api/founder/projects'), /Sign-in expired/);
  assert.equal(expired, 1);
});
