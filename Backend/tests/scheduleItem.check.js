// Checks the pure item rules, with no database:  node tests/scheduleItem.check.js
import assert from 'node:assert/strict';
import {
  describeItem,
  itemWarnings,
  changedRefs,
  isSlotKind,
  slotConflictMessage,
  spanDays,
  ITEM_UPDATE_FIELDS,
  CLEARABLE_FIELDS,
} from '../utils/scheduleItemRules.js';

const day = (text) => new Date(`${text}T00:00:00.000Z`);
let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
};

check('describeItem: a single date', () => {
  assert.equal(
    describeItem({ kind: 'quiz', title: 'Quiz 1', startDate: day('2026-10-12'), endDate: day('2026-10-12') }),
    'quiz "Quiz 1" on 2026-10-12'
  );
});

check('describeItem: a range and a two-word kind', () => {
  assert.equal(
    describeItem({ kind: 'mass_bunk', title: 'Fest', startDate: day('2026-10-12'), endDate: day('2026-10-14') }),
    'mass bunk "Fest" from 2026-10-12 to 2026-10-14'
  );
});

check('spanDays counts both ends', () => {
  assert.equal(spanDays(day('2026-10-12'), day('2026-10-12')), 1);
  assert.equal(spanDays(day('2026-10-12'), day('2026-10-14')), 3);
});

check('itemWarnings: inside the semester gives none', () => {
  const schedule = { semesterStart: day('2026-07-20'), semesterEnd: day('2026-12-10') };
  const item = { kind: 'holiday', startDate: day('2026-10-02'), endDate: day('2026-10-02') };
  assert.deepEqual(itemWarnings(item, schedule, 31), []);
});

check('itemWarnings: outside the semester warns', () => {
  const schedule = { semesterStart: day('2026-07-20'), semesterEnd: day('2026-12-10') };
  const item = { kind: 'exam', startDate: day('2026-12-08'), endDate: day('2026-12-15') };
  const warnings = itemWarnings(item, schedule, 31);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /outside the schedule's semester dates/);
});

check('itemWarnings: no semester dates means no semester warning', () => {
  const item = { kind: 'holiday', startDate: day('2026-01-01'), endDate: day('2026-01-01') };
  assert.deepEqual(itemWarnings(item, { semesterStart: null, semesterEnd: null }, 31), []);
});

check('itemWarnings: a long range warns, 31 days does not', () => {
  const none = { semesterStart: null, semesterEnd: null };
  const thirtyOne = { kind: 'break', startDate: day('2026-10-01'), endDate: day('2026-10-31') };
  const thirtyTwo = { kind: 'break', startDate: day('2026-10-01'), endDate: day('2026-11-01') };
  assert.deepEqual(itemWarnings(thirtyOne, none, 31), []);
  assert.match(itemWarnings(thirtyTwo, none, 31)[0], /covers 32 days/);
});

check('changedRefs: a note-only edit changes nothing', () => {
  const state = { subjectKey: 'abc', group: 'lab-a', slotKey: 'quiz_1' };
  assert.deepEqual(changedRefs(state, { ...state }), { subject: false, group: false, slot: false });
});

check('changedRefs: a new subject also re-checks the slot', () => {
  const current = { subjectKey: 'abc', group: null, slotKey: 'midsem' };
  assert.deepEqual(changedRefs(current, { ...current, subjectKey: 'def' }), {
    subject: true,
    group: false,
    slot: true,
  });
});

check('changedRefs: undefined, empty and null are the same', () => {
  assert.deepEqual(
    changedRefs({ subjectKey: undefined, group: '', slotKey: null }, { subjectKey: null, group: null, slotKey: undefined }),
    { subject: false, group: false, slot: false }
  );
});

check('changedRefs: a create from nothing flags what was given', () => {
  assert.deepEqual(changedRefs({}, { subjectKey: null, group: 'lab-a', slotKey: null }), {
    subject: false,
    group: true,
    slot: false,
  });
  assert.equal(changedRefs({}, { subjectKey: 'abc', group: null, slotKey: 'quiz_1' }).slot, true);
});

check('isSlotKind: only a quiz or an exam', () => {
  assert.equal(isSlotKind('quiz'), true);
  assert.equal(isSlotKind('exam'), true);
  assert.equal(isSlotKind('holiday'), false);
  assert.equal(isSlotKind('mass_bunk'), false);
});

check('slotConflictMessage: with and without a subject', () => {
  assert.equal(
    slotConflictMessage({ kind: 'quiz', slotKey: 'quiz_1', subjectName: 'Maths' }),
    'Maths already has an active quiz in slot quiz_1'
  );
  assert.equal(
    slotConflictMessage({ kind: 'exam', slotKey: 'midsem', subjectName: null }),
    'An active exam for every subject already exists in slot midsem'
  );
});

check('the kind is not editable, and only optional fields can be cleared', () => {
  assert.equal(ITEM_UPDATE_FIELDS.includes('kind'), false);
  for (const field of ['title', 'startDate', 'endDate']) {
    assert.equal(CLEARABLE_FIELDS.includes(field), false);
  }
  for (const field of CLEARABLE_FIELDS) assert.equal(ITEM_UPDATE_FIELDS.includes(field), true);
});

console.log(`\n${passed} checks passed`);