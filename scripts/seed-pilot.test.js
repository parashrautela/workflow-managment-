import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('sample data never overwrites a file, accesses production, or creates password logins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'iksha-seed-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'demo.json');
  const seed = (env = {}) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./seed-pilot.js', import.meta.url)), filename],
      {
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: '', ...env },
        encoding: 'utf8',
      },
    );
  assert.equal(seed({ NODE_ENV: 'production' }).status, 1);
  assert.equal(seed({ DATABASE_URL: 'postgres://unused' }).status, 1);
  const result = seed();
  assert.equal(result.status, 0, result.stderr);
  const content = readFileSync(filename, 'utf8');
  const data = JSON.parse(content);
  assert.equal(data.projects.length, 1);
  assert.equal(data.employees.length, 2);
  assert.ok(data.employees.every((user) => !('passwordHash' in user)));
  assert.doesNotMatch(result.stdout, /FOUNDER_PASSWORD|sample employee password/);
  assert.equal(seed().status, 1);
  assert.equal(readFileSync(filename, 'utf8'), content);
});
