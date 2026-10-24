import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ApiError from '../utils/ApiError.js';
import { canonicalSnapshot } from '../utils/scheduleActions.js';
import { findRuleClashes, describeRule } from '../utils/scheduleRuleClash.js';
import { allocateRevision, recordAction } from './scheduleRevision.service.js';
import { loadEditableSchedule, saveOrThrow, countAttachedStudents } from './officialSchedule.service.js';
import { ACTION_OP, ACTION_TARGET, ENTRY_TYPE, ITEM_STATUS, SCHEDULE_STATUS } from '../utils/constants.js';

// The CR's weekly classes and makeup classes. Same write order as the other publisher services:
//   1. take the next revision   2. save the record with it   3. write the action log entry
// These records hold no dates of classes and no attendance. A student's sync turns each one into
// a RecurringRule in their own setup.

const MAX_SCHEDULE_RULES = 300;

const RULE_FIELDS = [
  'subjectKey', 'weekday', 'startTime', 'endTime', 'classType', 'group', 'room', 'professor', 'attendanceUnits',
];
// Changing one of these can create or remove a clash with another class
const CLASH_FIELDS = ['weekday', 'startTime', 'endTime', 'group', 'effectiveStartDate', 'effectiveEndDate'];

const dateText = (date) => (date ? date.toISOString().slice(0, 10) : null);

const shapeRule = (rule, subjectName) => ({
  id: rule._id,
  subjectKey: rule.subjectKey,
  subjectName: subjectName ?? null,
  entryType: rule.entryType,
  weekday: rule.weekday,
  // a makeup class is on one date
  date: rule.entryType === ENTRY_TYPE.MAKEUP ? dateText(rule.effectiveStartDate) : null,
  startTime: rule.startTime,
  endTime: rule.endTime,
  classType: rule.classType,
  group: rule.group ?? null,
  room: rule.room ?? null,
  professor: rule.professor ?? null,
  attendanceUnits: rule.attendanceUnits,
  effectiveStartDate: rule.entryType === ENTRY_TYPE.WEEKLY ? dateText(rule.effectiveStartDate) : null,
  effectiveEndDate: rule.entryType === ENTRY_TYPE.WEEKLY ? dateText(rule.effectiveEndDate) : null,
  status: rule.status,
  revision: rule.revision,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
});

const studentsReached = (schedule) =>
  schedule.status === SCHEDULE_STATUS.PUBLISHED ? countAttachedStudents(schedule._id) : 0;

const findRule = async (scheduleId, ruleId) => {
  const rule = await ScheduleRule.findOne({ _id: ruleId, scheduleId });
  if (!rule) throw new ApiError(404, 'Class not found');
  return rule;
};

// Turns a model ValidationError into a clean 400 before a revision is taken
const validateOrThrow = async (doc) => {
  try {
    await doc.validate();
  } catch (err) {
    if (err?.name === 'ValidationError') {
      throw new ApiError(400, 'Validation failed', Object.values(err.errors).map((e) => e.message));
    }
    throw err;
  }
};

// The subject must be an active subject of this schedule
const requireActiveSubject = async (scheduleId, subjectKey) => {
  const subject = await ScheduleSubject.findOne({ scheduleId, key: subjectKey, status: ITEM_STATUS.ACTIVE })
    .select('name key')
    .lean();
  if (!subject) throw new ApiError(400, 'Subject not found in this schedule. Add it first, or restore it.');
  return subject;
};

// A group must be one the schedule defines (null means the whole section)
const assertGroupKnown = (schedule, group) => {
  if (group && !(schedule.groups ?? []).some((g) => g.key === group)) {
    throw new ApiError(400, `The group "${group}" is not defined in this schedule. Add it to the schedule's groups first.`);
  }
};

// Messages for the active classes that clash with `rule`
const clashMessages = async (schedule, rule, subjectName) => {
  const others = await ScheduleRule.find({
    scheduleId: schedule._id,
    status: ITEM_STATUS.ACTIVE,
    weekday: rule.weekday,
  }).lean();
  const clashing = findRuleClashes(typeof rule.toObject === 'function' ? rule.toObject() : rule, others);
  if (!clashing.length) return [];

  const subjects = await ScheduleSubject.find({ scheduleId: schedule._id, key: { $in: clashing.map((r) => r.subjectKey) } })
    .select('key name')
    .lean();
  const names = new Map(subjects.map((s) => [s.key, s.name]));
  return clashing.map(
    (other) =>
      `${describeRule(rule, subjectName)} overlaps with ${describeRule(other, names.get(other.subjectKey) ?? 'another subject')}`
  );
};

const makeupWarnings = (schedule, rule) => {
  if (rule.entryType !== ENTRY_TYPE.MAKEUP || !schedule.semesterStart || !schedule.semesterEnd) return [];
  const date = rule.effectiveStartDate;
  return date < schedule.semesterStart || date > schedule.semesterEnd
    ? [`This makeup class is on ${dateText(date)}, outside the semester dates (${dateText(schedule.semesterStart)} to ${dateText(schedule.semesterEnd)}).`]
    : [];
};

const logChange = ({ schedule, actor, rule, seq, op, before, summary, note, students }) =>
  recordAction({
    scheduleId: schedule._id,
    seq,
    target: { kind: ACTION_TARGET.RULE, id: rule._id },
    op,
    before,
    after: canonicalSnapshot('rule', rule),
    actor,
    summary,
    note: note ?? '',
    affectedStudents: students,
  });

// ---------- Read ----------

// query (already cleaned): { status, subjectKey?, weekday?, entryType? }
const listRules = async ({ user, scheduleId, query }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const filter = { scheduleId: schedule._id };
  if (query.status !== 'all') filter.status = query.status;
  if (query.subjectKey) filter.subjectKey = query.subjectKey;
  if (query.weekday !== undefined) filter.weekday = query.weekday;
  if (query.entryType) filter.entryType = query.entryType;

  const [rules, subjects] = await Promise.all([
    ScheduleRule.find(filter).sort({ weekday: 1, startTime: 1, _id: 1 }).lean(),
    ScheduleSubject.find({ scheduleId: schedule._id }).select('key name').lean(),
  ]);
  const names = new Map(subjects.map((s) => [s.key, s.name]));
  return { rules: rules.map((r) => shapeRule(r, names.get(r.subjectKey))) };
};

const getRule = async ({ user, scheduleId, ruleId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const rule = await findRule(schedule._id, ruleId);
  const subject = await ScheduleSubject.findOne({ scheduleId: schedule._id, key: rule.subjectKey }).select('name').lean();
  return { rule: shapeRule(rule, subject?.name) };
};

// ---------- Create ----------

// input (already cleaned): { subjectKey, entryType, weekday?, date?, startTime, endTime,
//   classType?, group?, room?, professor?, attendanceUnits?, effectiveStartDate?, effectiveEndDate?,
//   confirmOverlap?, note? }
const createRule = async ({ user, scheduleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });

  const count = await ScheduleRule.countDocuments({ scheduleId: schedule._id, status: ITEM_STATUS.ACTIVE });
  if (count >= MAX_SCHEDULE_RULES) throw new ApiError(409, `A schedule can have at most ${MAX_SCHEDULE_RULES} classes`);

  const subject = await requireActiveSubject(schedule._id, input.subjectKey);
  assertGroupKnown(schedule, input.group);

  const fields = { scheduleId: schedule._id, entryType: input.entryType };
  for (const f of RULE_FIELDS) if (input[f] !== undefined) fields[f] = input[f];
  if (input.entryType === ENTRY_TYPE.MAKEUP) {
    fields.effectiveStartDate = input.date; // the model reads the weekday from the date
    fields.effectiveEndDate = input.date;
    delete fields.weekday;
  } else {
    if (input.effectiveStartDate) fields.effectiveStartDate = input.effectiveStartDate;
    if (input.effectiveEndDate) fields.effectiveEndDate = input.effectiveEndDate;
  }

  const rule = new ScheduleRule(fields);
  await validateOrThrow(rule);

  const clashes = await clashMessages(schedule, rule, subject.name);
  if (clashes.length && input.confirmOverlap !== true) {
    throw new ApiError(409, 'This class overlaps with another one', [
      ...clashes,
      'Send confirmOverlap: true to add it anyway.',
    ]);
  }

  rule.revision = await allocateRevision(schedule._id);
  await saveOrThrow(rule);

  const students = await studentsReached(schedule);
  try {
    await logChange({
      schedule, actor, rule, seq: rule.revision, op: ACTION_OP.CREATE, before: null,
      summary: `Added ${rule.entryType === ENTRY_TYPE.MAKEUP ? 'a makeup class' : 'a weekly class'}: ${describeRule(rule, subject.name)}`,
      note: input.note, students,
    });
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    await ScheduleRule.deleteOne({ _id: rule._id }).catch(() => {});
    throw err;
  }

  return {
    rule: shapeRule(rule, subject.name),
    warnings: [...clashes, ...makeupWarnings(schedule, rule)],
    affectedStudents: students,
  };
};

// ---------- Update ----------

const updateRule = async ({ user, scheduleId, ruleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const rule = await findRule(schedule._id, ruleId);
  if (rule.status === ITEM_STATUS.WITHDRAWN) {
    throw new ApiError(409, 'This class is withdrawn. Restore it before changing it.');
  }

  const isMakeup = rule.entryType === ENTRY_TYPE.MAKEUP;
  if (isMakeup && (input.weekday !== undefined || input.effectiveStartDate !== undefined || input.effectiveEndDate !== undefined)) {
    throw new ApiError(400, 'A makeup class is moved with its date. Its weekday comes from the date.');
  }
  if (!isMakeup && input.date !== undefined) {
    throw new ApiError(400, 'date is only for a makeup class. Use weekday for a weekly class.');
  }

  const before = canonicalSnapshot('rule', rule);

  for (const f of RULE_FIELDS) if (input[f] !== undefined) rule.set(f, input[f]);
  if (isMakeup && input.date !== undefined) {
    rule.set('effectiveStartDate', input.date);
    rule.set('effectiveEndDate', input.date);
  } else if (!isMakeup) {
    if (input.effectiveStartDate !== undefined) rule.set('effectiveStartDate', input.effectiveStartDate);
    if (input.effectiveEndDate !== undefined) rule.set('effectiveEndDate', input.effectiveEndDate);
  }

  if (input.subjectKey !== undefined && input.subjectKey !== before.subjectKey) {
    await requireActiveSubject(schedule._id, input.subjectKey);
  }
  if (input.group !== undefined) assertGroupKnown(schedule, rule.group);
  await validateOrThrow(rule);

  const after = canonicalSnapshot('rule', rule);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return { rule: shapeRule(rule), changed: false, warnings: [], affectedStudents: 0 };
  }

  const subject = await ScheduleSubject.findOne({ scheduleId: schedule._id, key: rule.subjectKey }).select('name').lean();
  const subjectName = subject?.name ?? 'Subject';

  let clashes = [];
  if (CLASH_FIELDS.some((f) => rule.isModified(f))) {
    clashes = await clashMessages(schedule, rule, subjectName);
    if (clashes.length && input.confirmOverlap !== true) {
      throw new ApiError(409, 'This change makes the class overlap with another one', [
        ...clashes,
        'Send confirmOverlap: true to save it anyway.',
      ]);
    }
  }

  rule.revision = await allocateRevision(schedule._id);
  await saveOrThrow(rule);

  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, rule, seq: rule.revision, op: ACTION_OP.UPDATE, before,
    summary: `Changed ${describeRule(rule, subjectName)}`, note: input.note, students,
  });

  return {
    rule: shapeRule(rule, subjectName),
    changed: true,
    warnings: [...clashes, ...makeupWarnings(schedule, rule)],
    affectedStudents: students,
  };
};

// ---------- Withdraw and restore ----------

const withdrawRule = async ({ user, scheduleId, ruleId, input = {} }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const rule = await findRule(schedule._id, ruleId);
  if (rule.status === ITEM_STATUS.WITHDRAWN) throw new ApiError(409, 'This class is already withdrawn');

  const subject = await ScheduleSubject.findOne({ scheduleId: schedule._id, key: rule.subjectKey }).select('name').lean();
  const before = canonicalSnapshot('rule', rule);
  rule.revision = await allocateRevision(schedule._id);
  rule.status = ITEM_STATUS.WITHDRAWN;
  await saveOrThrow(rule);

  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, rule, seq: rule.revision, op: ACTION_OP.WITHDRAW, before,
    summary: `Withdrew ${describeRule(rule, subject?.name ?? 'Subject')}`, note: input.note, students,
  });
  return { rule: shapeRule(rule, subject?.name), affectedStudents: students };
};

// Bringing a class back needs its subject and group to still exist. A clash is a warning only.
const restoreRule = async ({ user, scheduleId, ruleId, input = {} }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const rule = await findRule(schedule._id, ruleId);
  if (rule.status === ITEM_STATUS.ACTIVE) throw new ApiError(409, 'This class is already active');

  const subject = await ScheduleSubject.findOne({ scheduleId: schedule._id, key: rule.subjectKey, status: ITEM_STATUS.ACTIVE })
    .select('name')
    .lean();
  if (!subject) throw new ApiError(409, 'The subject of this class is withdrawn. Restore the subject first.');
  assertGroupKnown(schedule, rule.group);

  const before = canonicalSnapshot('rule', rule);
  rule.revision = await allocateRevision(schedule._id);
  rule.status = ITEM_STATUS.ACTIVE;
  await saveOrThrow(rule);

  const warnings = await clashMessages(schedule, rule, subject.name);
  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, rule, seq: rule.revision, op: ACTION_OP.UPDATE, before,
    summary: `Restored ${describeRule(rule, subject.name)}`, note: input.note, students,
  });
  return { rule: shapeRule(rule, subject.name), warnings, affectedStudents: students };
};

export { listRules, getRule, createRule, updateRule, withdrawRule, restoreRule };