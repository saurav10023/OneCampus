import OfficialSchedule from '../models/Official/officialSchedule.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import Setup from '../models/TimeTable/setup.model.js';
import ApiError from '../utils/ApiError.js';
import saveOrThrow from '../utils/saveOrThrow.js';
import { normalizeScopePart } from '../utils/scopeKey.js';
import { parseSemester } from '../utils/semester.js';
import { canEditSchedule, isCollegeAdmin } from '../utils/schedulePermissions.js';
import { canonicalSnapshot } from '../utils/scheduleActions.js';
import { allocateRevision, recordAction } from './scheduleRevision.service.js';
import { loadActiveRoles } from './scheduleRole.service.js';
import {
  ACTION_OP,
  ACTION_TARGET,
  GROUP_KIND,
  ITEM_STATUS,
  SCHEDULE_ROLE,
  SCHEDULE_STATUS,
} from '../utils/constants.js';

// Every change below follows the same order, so a failure can be retried:
//   1. take the next revision (one atomic increment, see scheduleRevision.service.js)
//   2. save the change
//   3. write the action log entry
// A crash after step 1 leaves a gap in the revision numbers, which is harmless: sync asks for
// "everything after the revision I last saw".

const dateText = (date) => (date ? date.toISOString().slice(0, 10) : null);

const shapeSchedule = (schedule) => ({
  id: schedule._id,
  college: schedule.college,
  academicYear: schedule.academicYear,
  semesterLabel: schedule.semesterLabel,
  semesterNumber: schedule.semesterNumber ?? null,
  branch: schedule.branch,
  section: schedule.section,
  status: schedule.status,
  contentRevision: schedule.contentRevision,
  semesterStart: dateText(schedule.semesterStart),
  semesterEnd: dateText(schedule.semesterEnd),
  groups: (schedule.groups ?? []).map((g) => ({ key: g.key, label: g.label, kind: g.kind })),
  publishedAt: schedule.publishedAt ?? null,
  createdAt: schedule.createdAt,
  updatedAt: schedule.updatedAt,
});

const duplicateScheduleError = () =>
  new ApiError(409, 'A live schedule already exists for this college, year, semester, branch and section');

// Students attached to a schedule. Setup.officialScheduleId must exist in the Setup schema: an
// unknown field in a query filter can be dropped by Mongoose, which would count every setup.
const assertSetupLink = () => {
  if (!Setup.schema.path('officialScheduleId')) {
    throw new Error('Setup.officialScheduleId is not defined in the Setup schema');
  }
};

const countAttachedStudents = (scheduleId) => {
  assertSetupLink();
  return Setup.countDocuments({ officialScheduleId: scheduleId });
};

// Attached students for several schedules in one query: Map of scheduleId text to count.
// A schedule nobody has joined is missing from the map, so read it with `?? 0`.
const countStudentsBySchedule = async (scheduleIds) => {
  if (!scheduleIds.length) return new Map();
  assertSetupLink();
  const rows = await Setup.aggregate([
    { $match: { officialScheduleId: { $in: scheduleIds } } },
    { $group: { _id: '$officialScheduleId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
};

// Loads a schedule and checks the caller may edit it. Returns the document and the actor that
// goes into the action log (an admin acts as admin, anyone else as CR).
const loadEditableSchedule = async ({ user, scheduleId, allowArchived = false }) => {
  const schedule = await OfficialSchedule.findById(scheduleId);
  if (!schedule) throw new ApiError(404, 'Schedule not found');

  const roles = await loadActiveRoles(user._id);
  const target = { collegeKey: schedule.collegeKey, branch: schedule.branch, section: schedule.section };
  if (!canEditSchedule(roles, target)) {
    throw new ApiError(403, 'You are not allowed to edit this schedule');
  }
  if (!allowArchived && schedule.status === SCHEDULE_STATUS.ARCHIVED) {
    throw new ApiError(409, 'An archived schedule is read-only');
  }

  const actor = {
    userId: user._id,
    role: isCollegeAdmin(roles, schedule.collegeKey) ? SCHEDULE_ROLE.ADMIN : SCHEDULE_ROLE.CR,
  };
  return { schedule, actor };
};

const scheduleTarget = (schedule) => ({ kind: ACTION_TARGET.SCHEDULE, id: schedule._id });

const freshSchedule = async (scheduleId) => shapeSchedule(await OfficialSchedule.findById(scheduleId).lean());

// ---------- Create ----------

// input (already cleaned by the validator):
//   { academicYear, semesterLabel, branch, section, semesterStart?, semesterEnd?, groups? }
const createSchedule = async ({ user, input }) => {
  if (!user.college) throw new ApiError(400, 'Add your college to your profile before creating a schedule');
  if (parseSemester(input.semesterLabel) === null) {
    throw new ApiError(400, `Could not read a semester number from "${input.semesterLabel}". Try "Sem 5".`);
  }

  const roles = await loadActiveRoles(user._id);
  const target = { collegeKey: normalizeScopePart(user.college), branch: input.branch, section: input.section };
  if (!canEditSchedule(roles, target)) {
    throw new ApiError(403, 'You can only create a schedule for a class you are the CR of');
  }
  const actor = {
    userId: user._id,
    role: isCollegeAdmin(roles, target.collegeKey) ? SCHEDULE_ROLE.ADMIN : SCHEDULE_ROLE.CR,
  };

  let schedule;
  try {
    schedule = new OfficialSchedule({
      college: user.college,
      academicYear: input.academicYear,
      semesterLabel: input.semesterLabel,
      branch: input.branch,
      section: input.section,
      semesterStart: input.semesterStart ?? null,
      semesterEnd: input.semesterEnd ?? null,
      groups: input.groups ?? [],
      status: SCHEDULE_STATUS.DRAFT,
      createdBy: user._id,
    });
    await saveOrThrow(schedule);
  } catch (err) {
    if (err?.code === 11000) throw duplicateScheduleError();
    throw err;
  }

  try {
    const seq = await allocateRevision(schedule._id);
    await recordAction({
      scheduleId: schedule._id,
      seq,
      target: scheduleTarget(schedule),
      op: ACTION_OP.CREATE,
      before: null,
      after: canonicalSnapshot('schedule', schedule),
      actor,
      summary: `Created the draft schedule for ${schedule.branch} ${schedule.section}, ${schedule.semesterLabel} ${schedule.academicYear}`,
    });
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    await OfficialSchedule.deleteOne({ _id: schedule._id }).catch(() => {});
    throw err;
  }

  return { schedule: await freshSchedule(schedule._id) };
};

// ---------- Read ----------

// query (already cleaned): { status?, branch?, section? }. Archived schedules are hidden unless
// status=archived is asked for.
const listSchedules = async ({ user, query = {} }) => {
  const roles = await loadActiveRoles(user._id);
  const scopes = roles.map((r) =>
    r.role === SCHEDULE_ROLE.ADMIN
      ? { collegeKey: r.collegeKey }
      : { collegeKey: r.collegeKey, branch: r.branch, section: r.section }
  );
  if (!scopes.length) throw new ApiError(403, 'Only a CR or an admin can manage schedules');

  const filter = { $or: scopes, status: query.status ?? { $ne: SCHEDULE_STATUS.ARCHIVED } };
  if (query.branch) filter.branch = query.branch;
  if (query.section) filter.section = query.section;

  const schedules = await OfficialSchedule.find(filter).sort({ updatedAt: -1, _id: 1 }).limit(100).lean();
  const students = await countStudentsBySchedule(schedules.map((s) => s._id));
  return schedules.map((s) => ({ ...shapeSchedule(s), students: students.get(String(s._id)) ?? 0 }));
};

const getSchedule = async ({ user, scheduleId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const active = { scheduleId: schedule._id, status: ITEM_STATUS.ACTIVE };
  const [subjects, rules, items, students] = await Promise.all([
    ScheduleSubject.countDocuments(active),
    ScheduleRule.countDocuments(active),
    ScheduleItem.countDocuments(active),
    countAttachedStudents(schedule._id),
  ]);
  return { schedule: shapeSchedule(schedule), counts: { subjects, rules, items, students } };
};

// ---------- Update (groups and semester dates) ----------

const normalizeGroups = (groups) =>
  (groups ?? [])
    .map((g) => ({ key: g.key, label: g.label, kind: g.kind ?? GROUP_KIND.LAB }))
    .sort((a, b) => a.key.localeCompare(b.key));

const sameTime = (a, b) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

// A group that active classes or items still use cannot be removed
const assertGroupsNotInUse = async (scheduleId, removedKeys) => {
  if (!removedKeys.length) return;
  const filter = { scheduleId, status: ITEM_STATUS.ACTIVE, group: { $in: removedKeys } };
  const [rules, items] = await Promise.all([
    ScheduleRule.countDocuments(filter),
    ScheduleItem.countDocuments(filter),
  ]);
  if (rules || items) {
    throw new ApiError(409, 'A group that is still used cannot be removed', [
      `Groups in use: ${removedKeys.join(', ')}`,
      `${rules} class(es) and ${items} item(s) still use them. Change or withdraw those first.`,
    ]);
  }
};

// input (already cleaned): { groups?, semesterStart?, semesterEnd? }
// Dates are given together; null clears them. Only a groups change is logged and takes a revision:
// the semester dates are offered once, when a student joins, and are never synced.
const updateSchedule = async ({ user, scheduleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const before = canonicalSnapshot('schedule', schedule);

  const groupsChanged =
    input.groups !== undefined && JSON.stringify(normalizeGroups(input.groups)) !== JSON.stringify(before.groups);
  const datesChanged =
    input.semesterStart !== undefined &&
    (!sameTime(input.semesterStart, schedule.semesterStart) || !sameTime(input.semesterEnd, schedule.semesterEnd));

  if (!groupsChanged && !datesChanged) {
    return { schedule: shapeSchedule(schedule), changed: false };
  }

  let seq = null;
  if (groupsChanged) {
    const nextKeys = new Set(input.groups.map((g) => g.key));
    const removed = schedule.groups.map((g) => g.key).filter((key) => !nextKeys.has(key));
    await assertGroupsNotInUse(schedule._id, removed);
    schedule.groups = input.groups;
    seq = await allocateRevision(schedule._id);
  }
  if (datesChanged) {
    schedule.semesterStart = input.semesterStart;
    schedule.semesterEnd = input.semesterEnd;
  }
  await saveOrThrow(schedule);

  if (groupsChanged) {
    await recordAction({
      scheduleId: schedule._id,
      seq,
      target: scheduleTarget(schedule),
      op: ACTION_OP.UPDATE,
      before,
      after: canonicalSnapshot('schedule', schedule),
      actor,
      summary: 'Changed the groups',
      note: input.note ?? '',
    });
  }
  return { schedule: await freshSchedule(schedule._id), changed: true };
};

// ---------- Publish, unpublish, archive ----------

// from: the statuses this change may start from. guard: an extra check that may throw.
const changeStatus = async ({ user, scheduleId, from, to, op, summary, verb, note, guard }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  if (!from.includes(schedule.status)) {
    throw new ApiError(409, `This schedule is ${schedule.status}, so it cannot be ${verb}`);
  }
  const students = await countAttachedStudents(schedule._id);
  if (guard) guard({ schedule, students });

  const before = canonicalSnapshot('schedule', schedule);
  const seq = await allocateRevision(schedule._id);
  schedule.status = to;
  await saveOrThrow(schedule);

  await recordAction({
    scheduleId: schedule._id,
    seq,
    target: scheduleTarget(schedule),
    op,
    before,
    after: canonicalSnapshot('schedule', schedule),
    actor,
    summary,
    note: note ?? '',
    affectedStudents: students,
  });
  return { schedule: await freshSchedule(schedule._id) };
};

// Students can attach only to a published schedule
const publishSchedule = ({ user, scheduleId, note }) =>
  changeStatus({
    user,
    scheduleId,
    note,
    from: [SCHEDULE_STATUS.DRAFT],
    to: SCHEDULE_STATUS.PUBLISHED,
    op: ACTION_OP.PUBLISH,
    verb: 'published',
    summary: 'Published the schedule',
  });

// Back to a draft. Refused once any student has attached: they would be left on a schedule that
// has been hidden from them.
const unpublishSchedule = ({ user, scheduleId, note }) =>
  changeStatus({
    user,
    scheduleId,
    note,
    from: [SCHEDULE_STATUS.PUBLISHED],
    to: SCHEDULE_STATUS.DRAFT,
    op: ACTION_OP.UNPUBLISH,
    verb: 'unpublished',
    summary: 'Moved the schedule back to a draft',
    guard: ({ students }) => {
      if (students > 0) {
        throw new ApiError(409, 'Students have already joined this schedule, so it cannot go back to a draft', [
          `${students} student(s) are attached. Archive it instead.`,
        ]);
      }
    },
  });

// Read-only from now on and skipped by sync. Allowed with students attached.
const archiveSchedule = ({ user, scheduleId, note }) =>
  changeStatus({
    user,
    scheduleId,
    note,
    from: [SCHEDULE_STATUS.DRAFT, SCHEDULE_STATUS.PUBLISHED],
    to: SCHEDULE_STATUS.ARCHIVED,
    op: ACTION_OP.UPDATE,
    verb: 'archived',
    summary: 'Archived the schedule',
  });

export {
  saveOrThrow,
  countAttachedStudents,
  countStudentsBySchedule,
  loadEditableSchedule,
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  publishSchedule,
  unpublishSchedule,
  archiveSchedule,
};