import assert from 'node:assert/strict';
import { timesOverlap, groupsClash, datesOverlap, rulesClash, findRuleClashes, describeRule } from '../utils/scheduleRuleClash.js';
import { validateCreateSubject, validateUpdateSubject, validateNoteBody, validateSubjectListQuery } from '../validators/scheduleSubject.validator.js';
import { validateCreateRule, validateUpdateRule, validateRuleNoteBody, validateRuleListQuery } from '../validators/scheduleRule.validator.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', n, name); };
const run = (mw, input, where = 'body') => {
  const req = where === 'query' ? { query: input } : { body: input };
  try { mw(req, {}, () => {}); return { ok: true, out: where === 'query' ? req.validatedQuery : req.body }; }
  catch (e) { return { ok: false, status: e.statusCode, message: e.message, errors: e.errors }; }
};
const day = (t) => new Date(`${t}T00:00:00.000Z`);

// ---- clash logic ----
const weekly = (id, extra = {}) => ({ _id: id, entryType: 'weekly', weekday: 1, startTime: '09:00', endTime: '10:00', group: null,
  effectiveStartDate: null, effectiveEndDate: null, status: 'active', ...extra });
test('clash: same weekday and overlapping times', () => assert.equal(rulesClash(weekly('a'), weekly('b', { startTime: '09:30', endTime: '10:30' })), true));
test('clash: touching times do not clash', () => assert.equal(timesOverlap(weekly('a'), weekly('b', { startTime: '10:00', endTime: '11:00' })), false));
test('clash: a different weekday never clashes', () => assert.equal(rulesClash(weekly('a'), weekly('b', { weekday: 2 })), false));
test('clash: two different groups never clash, a group and the whole section do', () => {
  assert.equal(groupsClash(weekly('a', { group: 'b1' }), weekly('b', { group: 'b2' })), false);
  assert.equal(rulesClash(weekly('a', { group: 'b1' }), weekly('b', { group: 'b2' })), false);
  assert.equal(rulesClash(weekly('a', { group: 'b1' }), weekly('b')), true);
  assert.equal(rulesClash(weekly('a', { group: 'b1' }), weekly('b', { group: 'b1' })), true);
});
test('clash: a class with no dates runs all semester, so it meets every date range', () => {
  const makeup = weekly('m', { entryType: 'makeup', effectiveStartDate: day('2026-10-26'), effectiveEndDate: day('2026-10-26') }); // a Monday
  assert.equal(rulesClash(weekly('a'), makeup), true);
});
test('clash: a makeup outside another class\'s date range does not clash', () => {
  const ranged = weekly('a', { effectiveStartDate: day('2026-08-01'), effectiveEndDate: day('2026-10-01') });
  const makeup = weekly('m', { entryType: 'makeup', effectiveStartDate: day('2026-10-26'), effectiveEndDate: day('2026-10-26') });
  assert.equal(rulesClash(ranged, makeup), false);
  assert.equal(datesOverlap(ranged, weekly('x', { effectiveStartDate: day('2026-09-01'), effectiveEndDate: day('2026-12-01') })), true);
});
test('findRuleClashes skips the candidate itself and withdrawn rules', () => {
  const c = weekly('a');
  const found = findRuleClashes(c, [weekly('a'), weekly('b', { status: 'withdrawn' }), weekly('c')]);
  assert.deepEqual(found.map((r) => r._id), ['c']);
});
test('describeRule', () => {
  assert.equal(describeRule(weekly('a', { group: 'b1' }), 'Maths'), 'Maths Mon 09:00-10:00 (b1)');
  assert.equal(describeRule(weekly('m', { entryType: 'makeup', effectiveStartDate: day('2026-10-26') }), 'Maths'), 'Maths makeup 2026-10-26 09:00-10:00');
});

// ---- subject validators ----
test('subject create: trims, uppercases the code, drops forged fields', () => {
  const r = run(validateCreateSubject, { name: '  Data Structures ', code: ' cs-301 ', note: ' why ', key: 'x', status: 'withdrawn', scheduleId: 'x', revision: 9, nameKey: 'x' });
  assert.ok(r.ok); assert.deepEqual(r.out, { name: 'Data Structures', code: 'CS-301', note: 'why' });
});
test('subject create: name required, blank code means none', () => {
  assert.equal(run(validateCreateSubject, {}).status, 400);
  assert.equal(run(validateCreateSubject, { name: 'X', code: '  ' }).out.code, null);
  assert.equal(run(validateCreateSubject, { name: 'X', code: null }).out.code, null);
});
test('subject create: bad name, code and note', () => {
  assert.equal(run(validateCreateSubject, { name: 5 }).status, 400);
  assert.equal(run(validateCreateSubject, { name: 'x'.repeat(101) }).status, 400);
  assert.equal(run(validateCreateSubject, { name: 'X', code: '!!' }).status, 400);
  assert.equal(run(validateCreateSubject, { name: 'X', code: 7 }).status, 400);
  assert.equal(run(validateCreateSubject, { name: 'X', note: 'n'.repeat(501) }).status, 400);
});
test('subject update: needs a name or a code; null removes the code', () => {
  assert.equal(run(validateUpdateSubject, {}).message, 'No valid fields to update');
  assert.equal(run(validateUpdateSubject, { note: 'only a note' }).message, 'No valid fields to update');
  assert.equal(run(validateUpdateSubject, { code: null }).out.code, null);
  assert.equal(run(validateUpdateSubject, { name: 'New' }).out.name, 'New');
});
test('subject: note body and list query', () => {
  assert.deepEqual(run(validateNoteBody, { note: ' x ', other: 1 }).out, { note: 'x' });
  assert.deepEqual(run(validateNoteBody, undefined).out, {});
  assert.equal(run(validateSubjectListQuery, {}, 'query').out.status, 'active');
  assert.equal(run(validateSubjectListQuery, { status: 'all' }, 'query').out.status, 'all');
  assert.equal(run(validateSubjectListQuery, { status: 'x' }, 'query').status, 400);
});

// ---- rule validators ----
const okWeekly = { subjectKey: 'abc', weekday: 1, startTime: '09:00', endTime: '10:00' };
test('rule create: a minimal weekly class', () => {
  const r = run(validateCreateRule, okWeekly); assert.ok(r.ok); assert.equal(r.out.entryType, 'weekly'); assert.equal(r.out.weekday, 1);
});
test('rule create: full weekly class, group lower-cased, blank room removed to null', () => {
  const r = run(validateCreateRule, { ...okWeekly, classType: 'lab', group: ' B1 ', room: ' ', professor: 'Dr X', attendanceUnits: 2,
    effectiveStartDate: '2026-08-01', effectiveEndDate: '2026-12-15', confirmOverlap: true, note: 'new lab' });
  assert.ok(r.ok); assert.equal(r.out.group, 'b1'); assert.equal(r.out.room, null); assert.equal(r.out.attendanceUnits, 2);
  assert.deepEqual(r.out.effectiveStartDate, day('2026-08-01')); assert.equal(r.out.confirmOverlap, true);
});
test('rule create: forged fields dropped', () => {
  const r = run(validateCreateRule, { ...okWeekly, scheduleId: 'x', status: 'withdrawn', revision: 99, _id: 'x' });
  assert.ok(r.ok); assert.deepEqual(Object.keys(r.out).sort(), ['endTime', 'entryType', 'startTime', 'subjectKey', 'weekday']);
});
test('rule create: a makeup class needs a date and takes no weekday or range', () => {
  const ok = run(validateCreateRule, { subjectKey: 'abc', entryType: 'makeup', date: '2026-10-26', startTime: '16:00', endTime: '17:00', group: 'b2' });
  assert.ok(ok.ok); assert.deepEqual(ok.out.date, day('2026-10-26')); assert.equal(ok.out.weekday, undefined);
  assert.equal(run(validateCreateRule, { subjectKey: 'abc', entryType: 'makeup', startTime: '16:00', endTime: '17:00' }).status, 400);
  assert.equal(run(validateCreateRule, { subjectKey: 'abc', entryType: 'makeup', date: '2026-10-26', weekday: 1, startTime: '16:00', endTime: '17:00' }).status, 400);
  assert.equal(run(validateCreateRule, { subjectKey: 'abc', entryType: 'makeup', date: '2026-10-26', effectiveStartDate: '2026-10-26', startTime: '16:00', endTime: '17:00' }).status, 400);
});
test('rule create: a weekly class takes no date', () => assert.equal(run(validateCreateRule, { ...okWeekly, date: '2026-10-26' }).status, 400));
test('rule create: required fields and bad values', () => {
  assert.equal(run(validateCreateRule, {}).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, weekday: 7 }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, weekday: 1.5 }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, weekday: '1' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, startTime: '9am' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, endTime: '08:00' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, classType: 'party' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, attendanceUnits: 7 }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, attendanceUnits: 1.5 }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, entryType: 'daily' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, confirmOverlap: 'yes' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, group: 'g'.repeat(21) }).status, 400);
});
test('rule create: the date range is both-or-neither and in order', () => {
  assert.equal(run(validateCreateRule, { ...okWeekly, effectiveStartDate: '2026-08-01' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, effectiveStartDate: '2026-09-01', effectiveEndDate: '2026-08-01' }).status, 400);
  assert.equal(run(validateCreateRule, { ...okWeekly, effectiveStartDate: '2026-02-31', effectiveEndDate: '2026-08-01' }).status, 400);
});
test('rule update: any field, entryType refused, nothing refused', () => {
  assert.equal(run(validateUpdateRule, { room: 'A-1' }).out.room, 'A-1');
  assert.equal(run(validateUpdateRule, { group: null }).out.group, null);
  assert.equal(run(validateUpdateRule, { effectiveStartDate: null, effectiveEndDate: null }).ok, true);
  assert.equal(run(validateUpdateRule, { entryType: 'makeup' }).status, 400);
  assert.equal(run(validateUpdateRule, {}).message, 'No valid fields to update');
  assert.equal(run(validateUpdateRule, { confirmOverlap: true, note: 'x' }).message, 'No valid fields to update');
  assert.equal(run(validateUpdateRule, { startTime: '11:00', endTime: '10:00' }).status, 400);
  assert.deepEqual(run(validateUpdateRule, { date: '2026-10-27' }).out.date, day('2026-10-27'));
});
test('rule: note body and list query', () => {
  assert.deepEqual(run(validateRuleNoteBody, { note: ' ok ' }).out, { note: 'ok' });
  assert.deepEqual(run(validateRuleListQuery, {}, 'query').out, { status: 'active' });
  const q = run(validateRuleListQuery, { subjectKey: 'k', weekday: '3', entryType: 'makeup', status: 'all' }, 'query').out;
  assert.deepEqual(q, { status: 'all', subjectKey: 'k', weekday: 3, entryType: 'makeup' });
  assert.equal(run(validateRuleListQuery, { weekday: '9' }, 'query').status, 400);
  assert.equal(run(validateRuleListQuery, { weekday: '' }, 'query').status, 400);
  assert.equal(run(validateRuleListQuery, { entryType: 'x' }, 'query').status, 400);
});
console.log(`\nall ${n} passed`);