import test from 'node:test';
import assert from 'node:assert/strict';
import { folderIdFrom } from './driveLink.js';

test('reads the folder id from the links Drive gives out', () => {
  const id = '1ua1Hqw28njRMX6YTB019Pg4JOG_4M_RC';
  assert.equal(folderIdFrom(`https://drive.google.com/drive/folders/${id}`), id);
  assert.equal(folderIdFrom(`https://drive.google.com/drive/u/0/folders/${id}?usp=sharing`), id);
  assert.equal(folderIdFrom(`https://drive.google.com/open?id=${id}`), id);
  assert.equal(folderIdFrom(`  ${id} `), id);
  assert.equal(folderIdFrom('https://example.com/not-a-folder'), '');
  assert.equal(folderIdFrom(''), '');
});
