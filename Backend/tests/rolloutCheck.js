import assert from 'node:assert/strict';
import { bucketOf, pendingKind, buildRollout } from '../src/utils/rolloutRules.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', n, name); };

test('bucket: how far behind', () => {
  assert.deepEqual([0, -3, 1, 5, 6, 25, 26, 500].map(bucketOf), ['upToDate', 'upToDate', 'slightly', 'slightly', 'behind', 'behind', 'far', 'far']);
});
test('pending kinds', () => {
  assert.equal(pendingKind('rule', 'updated'), 'changedClass');
  assert.equal(pendingKind('rule', 'withdrawn'), 'removedClass');
  assert.equal(pendingKind('subject', 'conflict'), 'subjectClash');
  assert.equal(pendingKind('item', 'updated'), 'other');
});

const schedule = { contentRevision: 100, groups: [{ key: 'b1', label: 'Batch 1' }, { key: 'b2', label: 'Batch 2' }, { key: 'b3', label: 'Batch 3' }] };
const setups = [
  { _id: 'a', status: 'active', lastSyncedContentRevision: 100, officialGroups: ['b1'] },
  { _id: 'b', status: 'active', lastSyncedContentRevision: 98, officialGroups: ['b1', 'b2'] },
  { _id: 'c', status: 'active', lastSyncedContentRevision: 90, officialGroups: [] },
  { _id: 'd', status: 'active', lastSyncedContentRevision: 60, officialGroups: ['b2', 'gone'] },
  { _id: 'e', status: 'active', lastSyncedContentRevision: 0, officialGroups: ['b2'] },
  { _id: 'f', status: 'archived', lastSyncedContentRevision: 10, officialGroups: ['b1'] },
];
const row = (setupId, kind, change, n = 1) => ({ _id: { setupId, kind, change }, n });

test('students: joined, up to date and how far behind the rest are', () => {
  const r = buildRollout({ schedule, setups, pendingRows: [] });
  assert.equal(r.students.joined, 5); assert.equal(r.students.archivedSetups, 1);
  assert.equal(r.students.upToDate, 1); assert.equal(r.students.behind, 4);
  assert.deepEqual(r.students.behindBy, { slightly: 1, behind: 1, far: 2 });   // b: 2, c: 10, d: 40, e: 100
  assert.equal(r.students.oldestRevision, 0);
});
test('groups: a student in two groups counts in both; unknown groups and no group are handled', () => {
  const r = buildRollout({ schedule, setups, pendingRows: [] });
  assert.deepEqual(r.groups.map((g) => [g.key, g.students]), [['b1', 2], ['b2', 3], ['b3', 0]]);   // the archived setup f is not counted
  assert.equal(r.studentsWithoutGroup, 1);                                                          // c picked none
});
test('pending: counts only active joined setups, split by kind', () => {
  const r = buildRollout({ schedule, setups, pendingRows: [
    row('a', 'rule', 'updated', 2), row('b', 'rule', 'withdrawn'), row('b', 'subject', 'conflict'),
    row('f', 'rule', 'updated', 5),            // archived setup: ignored
    row('zzz', 'rule', 'updated', 9),          // a student who left: ignored
    row('c', 'item', 'updated'),
  ] });
  assert.equal(r.pending.students, 3); assert.equal(r.pending.updates, 5);
  assert.deepEqual(r.pending.byKind, { changedClass: 2, removedClass: 1, subjectClash: 1, other: 1 });
});
test('nobody has joined: all zeros, no oldest revision', () => {
  const r = buildRollout({ schedule, setups: [], pendingRows: [] });
  assert.deepEqual(r.students, { joined: 0, archivedSetups: 0, upToDate: 0, behind: 0, behindBy: { slightly: 0, behind: 0, far: 0 }, oldestRevision: null });
  assert.equal(r.pending.students, 0); assert.equal(r.studentsWithoutGroup, 0);
});
test('a schedule at revision 0 and setups missing the field are up to date', () => {
  const r = buildRollout({ schedule: { contentRevision: 0, groups: [] }, setups: [{ _id: 'x', status: 'active' }], pendingRows: [] });
  assert.equal(r.students.upToDate, 1);
});
test('the result never carries a student id or name', () => {
  const text = JSON.stringify(buildRollout({ schedule, setups, pendingRows: [row('a', 'rule', 'updated')] }));
  for (const id of ['"a"', '"b"', '"c"']) assert.equal(text.includes(`${id},"status"`), false);
  assert.equal(text.includes('setupId'), false); assert.equal(text.includes('ownerId'), false);
});
console.log(`\nall ${n} passed`);