import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTelegramAttachment } from './telegram-media.js';
import { initializePilot } from './pilot.js';

test('media rejects unsafe file paths, oversize content and sanitizes transport errors',async()=>{
  for (const file of [{file_path:'../secret'},{file_path:'https://evil.example/file'},{file_path:'photos/a.jpg',file_size:20_000_001}]) {
    let calls=0;
    await assert.rejects(loadTelegramAttachment({fileId:'f'},'private-token',async()=>{calls++;return Response.json({ok:true,result:file});}));
    assert.equal(calls,1);
  }
  await assert.rejects(loadTelegramAttachment({fileId:'f'},'private-token',async()=>{throw new Error('private-token');}),e=>!e.message.includes('private-token') && e.status===502);
  let calls=0;
  await assert.rejects(loadTelegramAttachment({fileId:'f'},'private-token',async()=>{
    if (++calls===1) return Response.json({ok:true,result:{file_path:'photos/a.jpg'}});
    return new Response(new Uint8Array([1]),{headers:{'content-length':'20000001'}});
  }),e=>e.status===413);
});

test('startup preserves existing records and blocks an interrupted Telegram send',()=>{
  const state={decisionRequests:[{id:'req',deliveryStatus:'Sending',comments:[{text:'keep'}]}]};
  assert.equal(initializePilot(state),true);
  assert.equal(state.decisionRequests[0].deliveryStatus,'Unknown');
  assert.equal(state.decisionRequests[0].comments[0].text,'keep');
  assert.equal(initializePilot(state),false);
});
