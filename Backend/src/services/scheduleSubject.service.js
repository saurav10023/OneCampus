import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import ApiError from '../utils/ApiError.js';
import { canonicalSnapshot } from '../utils/scheduleActions.js';
import { allocateRevision, recordAction } from './scheduleRevision.service.js';
import { loadEditableSchedule, saveOrThrow, countAttachedStudents } from './officialSchedule.service.js';
import {
  ACTION_OP,
  ACTION_TARGET,
  ITEM_STATUS,
  SCHEDULE_STATUS,
  MAX_SCHEDULE_SUBJECTS,
} from '../utils/constants.js';

// The CR's subjects. Every change follows the same order as officialSchedule.service.js, so a
// failure can be retried:
//   1. take the next revision   2. save the record with it   3. write the action log entry
// A crash after step 1 only leaves a gap in the revision numbers, which is harmless.

const toNameKey = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

const label = (subject) => (subject.code ? `${subject.name} (${subject.code})` : subject.name);

const shapeSubject = (subject, usage) => ({
  id: subject._id,
  key: subject.key,
  name: subject.name,
  code: subject.code ?? null,
  status: subject.status,
  revision: subject.revision,
  ...(usage ? { usage } : {}),
  createdAt: subject.createdAt,
  updatedAt: subject.updatedAt,
});

const duplicateSubjectError = (err) =>
  new ApiError(
    409,
    Object.keys(err?.keyPattern ?? {}).includes('code')
      ? 'Another active subject in this schedule already uses that code'
      : 'An active subject with this name already exists in this schedule'
  );

// Friendlier than the unique index, and it avoids wasting a revision on the usual conflict.
// The index still decides when two requests collide.
const assertNoDuplicate = async (scheduleId, { name, code, excludeId }) => {
  const nameKey = toNameKey(name);
  const or = [{ nameKey }];
  if (code) or.push({ code });
  const clash = await ScheduleSubject.findOne({
    scheduleId,
    status: ITEM_STATUS.ACTIVE,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    $or: or,
  })
    .select('nameKey code')
    .lean();
  if (!clash) return;
  throw new ApiError(
    409,
    clash.nameKey === nameKey
      ? 'An active subject with this name already exists in this schedule'
      : 'Another active subject in this schedule already uses that code'
  );
};

const findSubject = async (scheduleId, subjectId) => {
  const subject = await ScheduleSubject.findOne({ _id: subjectId, scheduleId });
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
};

// How many active classes and items use each subject key
const usageByKey = async (scheduleId, key = null) => {
  const match = { scheduleId, status: ITEM_STATUS.ACTIVE, subjectKey: key ?? { $type: 'string' } };
  const group = [{ $match: match }, { $group: { _id: '$subjectKey', n: { $sum: 1 } } }];
  const [rules, items] = await Promise.all([ScheduleRule.aggregate(group), ScheduleItem.aggregate(group)]);
  const usage = new Map();
  for (const r of rules) usage.set(r._id, { rules: r.n, items: 0 });
  for (const i of items) usage.set(i._id, { rules: usage.get(i._id)?.rules ?? 0, items: i.n });
  return usage;
};

// Students can only be attached to a published schedule
const studentsReached = (schedule) =>
  schedule.status === SCHEDULE_STATUS.PUBLISHED ? countAttachedStudents(schedule._id) : 0;

const logChange = ({ schedule, actor, subject, seq, op, before, summary, note, students }) =>
  recordAction({
    scheduleId: schedule._id,
    seq,
    target: { kind: ACTION_TARGET.SUBJECT, id: subject._id },
    op,
    before,
    after: canonicalSnapshot('subject', subject),
    actor,
    summary,
    note: note ?? '',
    affectedStudents: students,
  });

// ---------- Read ----------

// query (already cleaned): { status: 'active' | 'withdrawn' | 'all' }
const listSubjects = async ({ user, scheduleId, query }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const filter = { scheduleId: schedule._id };
  if (query.status !== 'all') filter.status = query.status;

  const [subjects, usage] = await Promise.all([
    ScheduleSubject.find(filter).sort({ nameKey: 1 }).lean(),
    usageByKey(schedule._id),
  ]);
  return { subjects: subjects.map((s) => shapeSubject(s, usage.get(s.key) ?? { rules: 0, items: 0 })) };
};

const getSubject = async ({ user, scheduleId, subjectId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const subject = await findSubject(schedule._id, subjectId);
  const usage = await usageByKey(schedule._id, subject.key);
  return { subject: shapeSubject(subject, usage.get(subject.key) ?? { rules: 0, items: 0 }) };
};

// ---------- Create ----------

// input (already cleaned): { name, code?, note? }
const createSubject = async ({ user, scheduleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });

  const activeCount = await ScheduleSubject.countDocuments({ scheduleId: schedule._id, status: ITEM_STATUS.ACTIVE });
  if (activeCount >= MAX_SCHEDULE_SUBJECTS) {
    throw new ApiError(409, `A schedule can have at most ${MAX_SCHEDULE_SUBJECTS} subjects`);
  }
  await assertNoDuplicate(schedule._id, { name: input.name, code: input.code });

  const subject = new ScheduleSubject({
    scheduleId: schedule._id,
    name: input.name,
    code: input.code ?? undefined,
  });
  subject.revision = await allocateRevision(schedule._id);
  try {
    await saveOrThrow(subject);
  } catch (err) {
    if (err?.code === 11000) throw duplicateSubjectError(err);
    throw err;
  }

  const students = await studentsReached(schedule);
  try {
    await logChange({
      schedule, actor, subject, seq: subject.revision, op: ACTION_OP.CREATE, before: null,
      summary: `Added the subject ${label(subject)}`, note: input.note, students,
    });
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    await ScheduleSubject.deleteOne({ _id: subject._id }).catch(() => {});
    throw err;
  }
  return { subject: shapeSubject(subject), affectedStudents: students };
};

// ---------- Update ----------

// input (already cleaned): { name?, code? (null removes it), note? }
const updateSubject = async ({ user, scheduleId, subjectId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const subject = await findSubject(schedule._id, subjectId);
  if (subject.status === ITEM_STATUS.WITHDRAWN) {
    throw new ApiError(409, 'This subject is withdrawn. Restore it before changing it.');
  }

  const before = canonicalSnapshot('subject', subject);
  if (input.name !== undefined) subject.set('name', input.name);
  if (input.code !== undefined) subject.set('code', input.code); // null becomes "no code"
  if (JSON.stringify(before) === JSON.stringify(canonicalSnapshot('subject', subject))) {
    return { subject: shapeSubject(subject), changed: false, affectedStudents: 0 };
  }

  await assertNoDuplicate(schedule._id, { name: subject.name, code: subject.code, excludeId: subject._id });
  subject.revision = await allocateRevision(schedule._id);
  try {
    await saveOrThrow(subject);
  } catch (err) {
    if (err?.code === 11000) throw duplicateSubjectError(err);
    throw err;
  }

  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, subject, seq: subject.revision, op: ACTION_OP.UPDATE, before,
    summary: `Changed the subject ${label(subject)}`, note: input.note, students,
  });
  return { subject: shapeSubject(subject), changed: true, affectedStudents: students };
};

// ---------- Withdraw and restore ----------

// A subject that active classes or items still use cannot be withdrawn
const withdrawSubject = async ({ user, scheduleId, subjectId, input = {} }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const subject = await findSubject(schedule._id, subjectId);
  if (subject.status === ITEM_STATUS.WITHDRAWN) throw new ApiError(409, 'This subject is already withdrawn');

  const used = (await usageByKey(schedule._id, subject.key)).get(subject.key);
  if (used && (used.rules || used.items)) {
    throw new ApiError(409, 'A subject that is still used cannot be withdrawn', [
      `${used.rules} class(es) and ${used.items} item(s) still use it. Withdraw or move those first.`,
    ]);
  }

  const before = canonicalSnapshot('subject', subject);
  subject.revision = await allocateRevision(schedule._id);
  subject.status = ITEM_STATUS.WITHDRAWN;
  await saveOrThrow(subject);

  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, subject, seq: subject.revision, op: ACTION_OP.WITHDRAW, before,
    summary: `Withdrew the subject ${label(subject)}`, note: input.note, students,
  });
  return { subject: shapeSubject(subject), affectedStudents: students };
};

const restoreSubject = async ({ user, scheduleId, subjectId, input = {} }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const subject = await findSubject(schedule._id, subjectId);
  if (subject.status === ITEM_STATUS.ACTIVE) throw new ApiError(409, 'This subject is already active');

  // Its name or code may have been taken by another subject while it was withdrawn
  await assertNoDuplicate(schedule._id, { name: subject.name, code: subject.code, excludeId: subject._id });

  const before = canonicalSnapshot('subject', subject);
  subject.revision = await allocateRevision(schedule._id);
  subject.status = ITEM_STATUS.ACTIVE;
  try {
    await saveOrThrow(subject);
  } catch (err) {
    if (err?.code === 11000) throw duplicateSubjectError(err);
    throw err;
  }

  const students = await studentsReached(schedule);
  await logChange({
    schedule, actor, subject, seq: subject.revision, op: ACTION_OP.UPDATE, before,
    summary: `Restored the subject ${label(subject)}`, note: input.note, students,
  });
  return { subject: shapeSubject(subject), affectedStudents: students };
};

export { listSubjects, getSubject, createSubject, updateSubject, withdrawSubject, restoreSubject };