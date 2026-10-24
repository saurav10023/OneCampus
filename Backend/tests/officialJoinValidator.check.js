import assert from 'node:assert/strict';
import { validateJoinPreviewBody, validateJoinBody, validateLeaveBody } from '../validators/officialJoin.validator.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', n, name); };
const run = (mw, body) => { const req = { body }; try { mw(req, {}, () => {}); return { ok: true, out: req.body }; } catch (e) { return { ok: false, status: e.statusCode, errors: e.errors }; } };
const ID = '64b0000000000000000000a1';

test('preview: id only, groups normalized, subject map kept', () => {
  const r = run(validateJoinPreviewBody, { scheduleId: ID, groups: [' B1 ', 'b1', 'B2'], subjectMap: [{ key: 'ds', studentSubjectId: ID }, { key: 'os', studentSubjectId: null }], junk: 1, officialGroups: ['x'], setupId: 'x' });
  assert.ok(r.ok); assert.deepEqual(r.out.groups, ['b1', 'b2']); assert.equal(r.out.subjectMap.length, 2); assert.equal(r.out.junk, undefined);
  assert.deepEqual(Object.keys(r.out).sort(), ['groups', 'scheduleId', 'subjectMap']);
});
test('preview: scheduleId is required and must be an id', () => {
  assert.equal(run(validateJoinPreviewBody, {}).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: 'abc' }).status, 400);
  assert.equal(run(validateJoinPreviewBody, undefined).status, 400);
});
test('groups: must be a list of short keys', () => {
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, groups: 'b1' }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, groups: [1] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, groups: [''] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, groups: ['g'.repeat(21)] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, groups: Array.from({ length: 21 }, (_, i) => `g${i}`) }).status, 400);
  assert.deepEqual(run(validateJoinPreviewBody, { scheduleId: ID, groups: [] }).out.groups, []);
});
test('subjectMap: bad entries are refused', () => {
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, subjectMap: 'x' }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, subjectMap: [{ key: '', studentSubjectId: null }] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, subjectMap: [{ key: 'ds', studentSubjectId: 'nope' }] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, subjectMap: [{ key: 'ds' }] }).status, 400);
  assert.equal(run(validateJoinPreviewBody, { scheduleId: ID, subjectMap: Array.from({ length: 51 }, (_, i) => ({ key: `k${i}`, studentSubjectId: null })) }).status, 400);
});
test('join: confirm must be exactly true', () => {
  assert.equal(run(validateJoinBody, { scheduleId: ID }).status, 400);
  assert.equal(run(validateJoinBody, { scheduleId: ID, confirm: 'true' }).status, 400);
  assert.ok(run(validateJoinBody, { scheduleId: ID, confirm: true }).ok);
});
test('leave: confirm must be exactly true', () => {
  assert.equal(run(validateLeaveBody, {}).status, 400);
  assert.equal(run(validateLeaveBody, { confirm: 1 }).status, 400);
  assert.deepEqual(run(validateLeaveBody, { confirm: true, x: 1 }).out, { confirm: true });
});
console.log(`\nall ${n} passed`);