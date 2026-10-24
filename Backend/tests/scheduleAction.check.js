import assert from 'node:assert/strict';
import { canonicalSnapshot, snapshotMatches, statePatch, undoBlockedReason } from '../utils/scheduleActions.js';
import {
  undoability, targetState, makesActive, makesInactive, removedGroupKeys, rulesOverlap, describeReversal,
} from '../utils/scheduleUndoRules.js';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const item = (over = {}) => ({
  kind: 'exam', title: 'Mid-sem', startDate: new Date('2026-10-12T00:00:00Z'), endDate: new Date('2026-10-12T00:00:00Z'),
  startTime: null, endTime: null, subjectKey: 'cs101', slotKey: 'midsem', classType: null, group: null, note: '', status: 'active', ...over,
});
const act = (over = {}) => ({ _id: 'a1', op: 'create', target: { kind: 'item', id: 'i1' }, before: null, after: canonicalSnapshot('item', item()), undoneBy: null, summary: 'Added exam "Mid-sem"', ...over });

// --- undoability
check('plain action can be undone', () => assert.equal(undoability(act(), 'undo'), null));
check('undo of an undo action is refused', () => assert.match(undoability(act({ op: 'undo' }), 'undo'), /redo/));
check('redo of a plain action is refused', () => assert.match(undoability(act(), 'redo'), /Only an undo/));
check('redo of an undo is allowed', () => assert.equal(undoability(act({ op: 'undo' }), 'redo'), null));
check('already undone', () => assert.match(undoability(act({ undoneBy: 'x' }), 'undo'), /already been undone/));
check('already redone', () => assert.match(undoability(act({ op: 'undo', undoneBy: 'x' }), 'redo'), /already been redone/));
check('revert works on either kind', () => { assert.equal(undoability(act(), 'revert'), null); assert.equal(undoability(act({ op: 'undo' }), 'revert'), null); });
check('schedule creation is not undoable', () =>
  assert.match(undoability(act({ target: { kind: 'schedule', id: 's' }, before: null }), 'undo'), /Creating a schedule/));
check('schedule update is undoable', () =>
  assert.equal(undoability(act({ op: 'update', target: { kind: 'schedule', id: 's' }, before: { status: 'draft', groups: [] } }), 'undo'), null));

// --- target state and activity
check('target state is the before', () => assert.equal(targetState(act()), null));
check('null target makes inactive', () => assert.equal(makesInactive('item', null), true));
check('withdrawn target makes inactive', () => assert.equal(makesInactive('rule', { status: 'withdrawn' }), true));
check('active target makes active', () => assert.equal(makesActive('item', { status: 'active' }), true));
check('schedule is neither', () => { assert.equal(makesActive('schedule', { status: 'published' }), false); assert.equal(makesInactive('schedule', null), false); });

// --- the full cycle: create, undo, redo, with the existing snapshot rules
check('undo then redo walks the record through the right states', () => {
  const created = item();
  const create = act();
  // undo the create: the record must be as the create left it, and goes back to withdrawn
  assert.equal(undoBlockedReason('item', create, created), null);
  const afterUndo = { ...created, ...statePatch('item', targetState(create)) };
  assert.equal(afterUndo.status, 'withdrawn');

  const undo = { _id: 'u1', op: 'undo', target: create.target, before: canonicalSnapshot('item', created), after: canonicalSnapshot('item', afterUndo), undoneBy: null, summary: describeReversal(create, 'undo') };
  assert.equal(undoBlockedReason('item', undo, afterUndo), null);
  const afterRedo = { ...afterUndo, ...statePatch('item', targetState(undo)) };
  assert.equal(afterRedo.status, 'active');
  assert.equal(snapshotMatches('item', afterRedo, create.after), true);
  assert.equal(describeReversal(undo, 'redo'), 'Redid: Added exam "Mid-sem"');
});
check('a later edit blocks undo, revert ignores it', () => {
  const create = act();
  const edited = item({ title: 'Mid-sem (moved)' });
  assert.match(undoBlockedReason('item', create, edited), /changed again/);
});
check('undoing an update restores the old values', () => {
  const v1 = item();
  const v2 = item({ title: 'Renamed', note: 'x' });
  const update = act({ op: 'update', before: canonicalSnapshot('item', v1), after: canonicalSnapshot('item', v2) });
  assert.equal(undoBlockedReason('item', update, v2), null);
  const back = { ...v2, ...statePatch('item', targetState(update)) };
  assert.equal(back.title, 'Mid-sem');
  assert.equal(snapshotMatches('item', back, update.before), true);
});

// --- groups
check('removed group keys', () => assert.deepEqual(removedGroupKeys([{ key: 'a' }, { key: 'b' }], [{ key: 'a' }]), ['b']));
check('nothing removed', () => assert.deepEqual(removedGroupKeys([{ key: 'a' }], [{ key: 'a' }, { key: 'c' }]), []));

// --- class overlap
const rule = (o = {}) => ({ weekday: 1, startTime: '09:00', endTime: '10:00', group: null, effectiveStartDate: null, effectiveEndDate: null, ...o });
check('same slot overlaps', () => assert.equal(rulesOverlap(rule(), rule()), true));
check('touching times do not overlap', () => assert.equal(rulesOverlap(rule(), rule({ startTime: '10:00', endTime: '11:00' })), false));
check('different weekday does not overlap', () => assert.equal(rulesOverlap(rule(), rule({ weekday: 2 })), false));
check('different groups do not overlap', () => assert.equal(rulesOverlap(rule({ group: 'b1' }), rule({ group: 'b2' })), false));
check('whole section overlaps a group', () => assert.equal(rulesOverlap(rule(), rule({ group: 'b1' })), true));
check('disjoint dates do not overlap', () =>
  assert.equal(rulesOverlap(rule({ effectiveStartDate: '2026-08-01', effectiveEndDate: '2026-09-30' }), rule({ effectiveStartDate: '2026-10-01', effectiveEndDate: '2026-12-01' })), false));
check('open-ended range overlaps a dated one', () =>
  assert.equal(rulesOverlap(rule(), rule({ effectiveStartDate: '2026-10-01', effectiveEndDate: '2026-10-01' })), true));

// --- wording
check('undo wording', () => assert.equal(describeReversal(act(), 'undo'), 'Undid: Added exam "Mid-sem"'));
check('revert strips an old prefix', () => assert.equal(describeReversal(act({ summary: 'Undid: x' }), 'revert'), 'Reverted: x'));
check('long summaries are clipped to 200', () => assert.equal(describeReversal(act({ summary: 'y'.repeat(300) }), 'undo').length, 200));

console.log(`${passed} checks passed`);