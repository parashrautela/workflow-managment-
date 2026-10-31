import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { body } from './request.js';

test('request parser rejects invalid JSON, arrays and oversized bodies', async () => {
  assert.deepEqual(await body(Readable.from(['{"title":"Design"}'])), { title: 'Design' });
  for (const value of ['[]', 'null', '{']) {
    await assert.rejects(body(Readable.from([value])), (error) => error.status === 400);
  }
  await assert.rejects(
    body(Readable.from(['{"title":"Design"}']), 5),
    (error) => error.status === 413,
  );
});
