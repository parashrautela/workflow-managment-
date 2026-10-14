import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, calendarDay, timelineItems } from './timeline.js';
test('timeline uses valid source dates and preserves parallel stages',()=>{
  assert.equal(calendarDate('2026-02-30'),null);
  const tasks=[{id:'civil',stageId:'c',title:'Civil',sourceCurrentStart:'2026-10-14',sourceCurrentEnd:'2026-10-18'}, {id:'electrical',stageId:'e',title:'Electrical',sourceCurrentStart:'2026-10-16',deadline:'2026-10-19'}, {id:'unknown',title:'No dates'}, {id:'due',title:'Deadline only',deadline:'2026-10-20'}, {id:'deleted',deletedAt:'2026-10-14',title:'Hidden'}];
  const items=timelineItems(tasks,[{id:'c',name:'Civil'},{id:'e',name:'Electrical'}]);
  assert.equal(items.length,4);
  assert.ok(items[1].start<items[0].end);
  assert.equal(items[0].end,calendarDate('2026-10-19'));
  assert.equal(items[2].start,null);
  assert.equal(items[3].end-items[3].start,calendarDay);
  assert.equal(items[3].milestone,true);
});
test('stage dates are used only for tasks with a known compatible deadline',()=>{
  const items=timelineItems([{title:'Within stage',stageId:'design',deadline:'2026-10-16'}, {title:'No end',stageId:'design'}, {title:'Earlier deadline',stageId:'design',deadline:'2026-10-12'}],[{id:'design',startDate:'2026-10-14'}]);
  assert.equal(items[0].start,calendarDate('2026-10-14'));
  assert.equal(items[1].start,null);
  assert.equal(items[2].start,calendarDate('2026-10-12'));
});
