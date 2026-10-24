import assert from 'node:assert/strict';
import { EVENT_KINDS, CANCEL_KINDS, resolveSubjectMapping, clampRuleRange, countRuleClasses, planRuleJoin, itemAppliesToStudent, buildCancelFilter } from '../utils/officialJoinRules.js';

let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', n, name); };
const day = (t) => new Date(`${t}T00:00:00.000Z`);

// ---- subject mapping ----
const official = [
  { key: 'ds', name: 'Data Structures', code: 'CS301' },
  { key: 'm3', name: 'Engineering Mathematics III', code: 'MA201' },
  { key: 'os', name: 'Operating Systems', code: 'CS303' },
];
const student = [{ id: 'a', name: 'data structures' }, { id: 'b', name: 'Maths-III' }, { id: 'c', name: 'Yoga' }];
const map = (explicit, extra = {}) => resolveSubjectMapping({ officialSubjects: official, eligibleStudent: student, allStudent: student, explicit, ...extra });

test('mapping: an exact name links by itself, a likely one is only suggested, the rest are added', () => {
  const r = map([]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.links.map((l) => [l.key, l.studentSubjectId, l.how]), [['ds', 'a', 'exact']]);
  assert.deepEqual(r.adds.map((a) => a.key).sort(), ['m3', 'os']);
  assert.deepEqual(r.suggestions.map((s) => [s.key, s.studentSubjectId, s.level]), [['m3', 'b', 'likely']]);
});
test('mapping: the student accepts a suggestion by choosing it', () => {
  const r = map([{ key: 'm3', studentSubjectId: 'b' }]);
  assert.deepEqual(r.links.map((l) => [l.key, l.how]).sort(), [['ds', 'exact'], ['m3', 'chosen']]);
  assert.equal(r.suggestions.length, 0);
});
test('mapping: null adds an official subject as new even when it matches exactly', () => {
  const r = map([{ key: 'ds', studentSubjectId: null }]);
  assert.equal(r.links.length, 0); assert.ok(r.adds.some((a) => a.key === 'ds'));
});
test('mapping: errors for unknown keys, unknown ids, repeats and reuse of one subject', () => {
  assert.equal(map([{ key: 'zz', studentSubjectId: null }]).errors.length, 1);
  assert.equal(map([{ key: 'ds', studentSubjectId: 'nope' }]).errors.length, 1);
  assert.equal(map([{ key: 'ds', studentSubjectId: 'a' }, { key: 'ds', studentSubjectId: 'a' }]).errors.length >= 1, true);
  assert.equal(map([{ key: 'ds', studentSubjectId: 'c' }, { key: 'os', studentSubjectId: 'c' }]).errors.length, 1);
});
test('mapping: a subject that is already official cannot be linked again', () => {
  const r = map([{ key: 'os', studentSubjectId: 'x' }], { eligibleStudent: student, allStudent: [...student, { id: 'x' }] });
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /already linked/);
});
test('mapping: a choice stops an automatic exact match from taking the same subject', () => {
  const r = map([{ key: 'os', studentSubjectId: 'a' }]);        // the student gives subject a to os
  assert.deepEqual(r.errors, []);
  assert.equal(r.links.filter((l) => l.studentSubjectId === 'a').length, 1);
  assert.equal(r.links.find((l) => l.studentSubjectId === 'a').key, 'os');
  assert.ok(r.adds.some((a) => a.key === 'ds'));
});

// ---- date range ----
const setupStart = day('2026-08-01'); const setupEnd = day('2026-12-15');
test('range: no dates runs the whole setup', () => assert.deepEqual(clampRuleRange({ entryType: 'weekly' }, setupStart, setupEnd), { start: setupStart, end: setupEnd }));
test('range: official dates are clamped to the setup', () => {
  const r = clampRuleRange({ entryType: 'weekly', effectiveStartDate: day('2026-07-01'), effectiveEndDate: day('2026-10-01') }, setupStart, setupEnd);
  assert.deepEqual(r, { start: setupStart, end: day('2026-10-01') });
});
test('range: a class that ends before the setup starts cannot run', () => {
  assert.equal(clampRuleRange({ entryType: 'weekly', effectiveStartDate: day('2026-01-01'), effectiveEndDate: day('2026-02-01') }, setupStart, setupEnd), null);
});
test('range: a makeup class is kept only inside the setup', () => {
  assert.deepEqual(clampRuleRange({ entryType: 'makeup', effectiveStartDate: day('2026-10-26') }, setupStart, setupEnd), { start: day('2026-10-26'), end: day('2026-10-26') });
  assert.equal(clampRuleRange({ entryType: 'makeup', effectiveStartDate: day('2027-01-05') }, setupStart, setupEnd), null);
});
test('count: dates of a weekday in a range', () => {
  assert.equal(countRuleClasses(1, day('2026-10-19'), day('2026-10-25')), 1);   // one Monday in a Mon-Sun week
  assert.equal(countRuleClasses(0, day('2026-10-19'), day('2026-11-01')), 2);   // Oct 25 and Nov 1
  assert.equal(countRuleClasses(2, day('2026-10-19'), day('2026-10-19')), 0);   // Tuesday never occurs on one Monday
  assert.equal(countRuleClasses(1, day('2026-10-19'), day('2026-10-19')), 1);
  assert.equal(countRuleClasses(1, day('2026-10-20'), day('2026-10-19')), 0);   // empty range
  // the whole semester: Mondays from 3 Aug to 14 Dec 2026 = 20
  assert.equal(countRuleClasses(1, day('2026-08-01'), day('2026-12-15')), 20);
});

// ---- rule plan ----
const orule = (id, extra = {}) => ({ _id: id, subjectKey: 'ds', entryType: 'weekly', weekday: 1, startTime: '09:00', endTime: '10:00', classType: 'lecture', group: null,
  effectiveStartDate: null, effectiveEndDate: null, revision: 3, ...extra });
const srule = (id, extra = {}) => ({ _id: id, weekday: 1, startTime: '09:00', endTime: '10:00', classType: 'lecture', group: null, origin: 'manual', ...extra });
const plan = (rules, extra = {}) => planRuleJoin({ officialRules: rules, knownSubjectKeys: new Set(['ds', 'os']), subjectLinks: new Map([['ds', 'a']]),
  studentRulesBySubject: new Map([['a', [srule('s1')]]]), chosenGroups: ['b1'], setupStart, setupEnd, ...extra });
test('plan: the same class the student has is linked, not copied', () => {
  const r = plan([orule('o1')]); assert.equal(r.link.length, 1); assert.equal(r.link[0].studentRule._id, 's1'); assert.equal(r.add.length, 0);
});
test('plan: a different time is added', () => {
  const r = plan([orule('o1', { startTime: '10:00', endTime: '11:00' })]); assert.equal(r.link.length, 0); assert.equal(r.add.length, 1);
});
test('plan: one student class links only one official class', () => {
  const r = plan([orule('o1'), orule('o2')]); assert.equal(r.link.length, 1); assert.equal(r.add.length, 1);
});
test('plan: an already-official class of the student is never linked again', () => {
  const r = plan([orule('o1')], { studentRulesBySubject: new Map([['a', [srule('s1', { origin: 'official' })]]]) }); assert.equal(r.link.length, 0); assert.equal(r.add.length, 1);
});
test('plan: classes of other groups, unknown subjects and out-of-range dates are skipped and counted', () => {
  const r = plan([orule('g', { group: 'b2' }), orule('k', { subjectKey: 'zz' }), orule('d', { effectiveStartDate: day('2025-01-01'), effectiveEndDate: day('2025-02-01') }), orule('mine', { subjectKey: 'os', group: 'b1' })]);
  assert.deepEqual(r.skipped, { subject: 1, group: 1, range: 1 }); assert.equal(r.add.length, 1); assert.equal(r.add[0].rule._id, 'mine');
});
test('plan: a subject added as new has no student class to link to', () => {
  const r = plan([orule('o', { subjectKey: 'os' })]); assert.equal(r.link.length, 0); assert.equal(r.add.length, 1);
});

// ---- items ----
test('items: kinds split into events and cancel items', () => {
  for (const k of ['holiday', 'break', 'last_working_day', 'event', 'quiz', 'exam']) assert.ok(EVENT_KINDS.has(k) && !CANCEL_KINDS.has(k));
  for (const k of ['mass_bunk', 'class_cancel']) assert.ok(CANCEL_KINDS.has(k) && !EVENT_KINDS.has(k));
});
test('items: a group item reaches only students in that group', () => {
  assert.equal(itemAppliesToStudent({ group: null }, []), true);
  assert.equal(itemAppliesToStudent({ group: 'b1' }, ['b1']), true);
  assert.equal(itemAppliesToStudent({ group: 'b1' }, ['b2']), false);
});
test('items: the cancel filter for a mass bunk and a class cancel', () => {
  const ids = new Map([['ds', 'a']]);
  assert.deepEqual(buildCancelFilter({ startDate: day('2026-10-23'), endDate: day('2026-10-23'), classType: 'lab', group: 'b1', startTime: '14:00', endTime: '17:00' }, ids),
    { from: day('2026-10-23'), to: day('2026-10-23'), classTypes: ['lab'], groups: ['b1'], time: { startTime: '14:00', endTime: '17:00' } });
  assert.deepEqual(buildCancelFilter({ startDate: day('2026-10-23'), endDate: day('2026-10-24'), subjectKey: 'ds' }, ids),
    { from: day('2026-10-23'), to: day('2026-10-24'), subjectIds: ['a'] });
  assert.equal(buildCancelFilter({ startDate: day('2026-10-23'), endDate: day('2026-10-23'), subjectKey: 'zz' }, ids), null);
  assert.deepEqual(Object.keys(buildCancelFilter({ startDate: day('2026-10-23'), endDate: day('2026-10-23') }, ids)), ['from', 'to']);
});
console.log(`\nall ${n} passed`);