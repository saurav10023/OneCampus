import OfficialSchedule from '../models/Official/officialSchedule.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import Setup from '../models/TimeTable/setup.model.js';
import Subject, { toNameKey } from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import SetupOfficialUpdate from '../models/Official/setupOfficialUpdate.model.js';
import ApiError from '../utils/ApiError.js';
import { normalizeScopePart, buildScopeKey } from '../utils/scopeKey.js';
import { semesterMatches } from '../utils/semester.js';
import {
  EVENT_KINDS,
  CANCEL_KINDS,
  resolveSubjectMapping,
  countRuleClasses,
  planRuleJoin,
  itemAppliesToStudent,
  buildCancelFilter,
} from '../utils/officialJoinRules.js';
import { generateOccurrences, getOccurrenceIdsInRange, reconcileRangeStatuses } from './occurrence.service.js';
import { applyCancellation, planCancellation } from './cancellation.service.js';
import {
  ATTENDANCE_STATUS,
  CAUSE_TYPE,
  DAY_MS,
  ITEM_STATUS,
  ORIGIN,
  SCHEDULE_STATUS,
  STATUS_REASON,
  STATUS_SOURCE,
} from '../utils/constants.js';

// The student side of an official schedule: find it, preview joining it, join, leave.
//
// A student's setup is matched to a schedule by FOUR things only:
//   academic year, semester, branch and section.
// College and the student's profile are never used.
//
// A join copies the CR's schedule into the student's own setup. The CR's records are never
// edited, and the student's attendance is never sent anywhere. Every step below is repeatable,
// and the link on the Setup is written LAST, so a join that stops halfway is finished by sending
// it again (or cleaned up by leaving).
//
// SEMESTER DATES: joining also moves the setup's start and end date to the schedule's
// semesterStart and semesterEnd. This happens once, at join time, and never again.
//   - A schedule with no start (or no end) leaves that side of the student's dates alone.
//   - A start after the end is refused.
//   - Longer semester: own classes that ran for the whole old semester run for the whole new one,
//     the new days are generated, and classes this same kind of change uncounted earlier come back.
//   - Shorter semester: classes outside the new dates become not_counted with their mark remembered
//     (the same reconcileRangeStatuses the setup's own date change uses), so nothing is deleted and
//     the marks return if the dates are widened again. Own classes are cut to the new range.
// The dates are saved together with the link in the last step, so a retry after a failure is safe.
//
// Official cancellations (exam, holiday, break, mass bunk, class cancel) apply to EVERY class in
// their range, marked or not. The earlier mark is remembered and comes back if the cancellation
// is withdrawn. That is why the preview tells the student how many marked classes this locks.

const MARKS = [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT, ATTENDANCE_STATUS.EXCUSED];

const dateText = (date) => (date ? date.toISOString().slice(0, 10) : null);
const sameDay = (a, b) => dateText(a) === dateText(b);
const scopeOf = (x) => ({
  academicYear: x.academicYear,
  semesterLabel: x.semesterLabel,
  branch: x.branch,
  section: x.section,
});

const assertSetupOpen = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};
const assertNotJoined = (setup) => {
  if (setup.officialScheduleId) {
    throw new ApiError(409, 'This setup already follows an official schedule. Leave it first to join another.');
  }
};

// ---------- Semester dates ----------

// The dates the setup will have after joining. Each side is decided on its own: the schedule's
// date when it has one, otherwise the student's.
const effectiveDates = (setup, schedule) => {
  const startDate = schedule.semesterStart ?? setup.startDate;
  const endDate = schedule.semesterEnd ?? setup.endDate;
  if (endDate < startDate) {
    throw new ApiError(
      409,
      'The official semester dates do not fit your setup dates (the end would be before the start). Change your setup dates, then join again.'
    );
  }
  return { startDate, endDate };
};

const datesChange = (setup, dates) => !sameDay(setup.startDate, dates.startDate) || !sameDay(setup.endDate, dates.endDate);

const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);
const dayBefore = (d) => new Date(d.getTime() - DAY_MS);
const dayAfter = (d) => new Date(d.getTime() + DAY_MS);

// leaving: stretches of the OLD range that fall outside the new dates (shorter semester)
// joining: stretches of the NEW range that the old dates did not cover (longer semester)
const dateRanges = (setup, dates) => {
  const leaving = [];
  if (dates.startDate > setup.startDate) {
    leaving.push({ from: setup.startDate, to: minDate(dayBefore(dates.startDate), setup.endDate), reason: STATUS_REASON.START_DATE_CHANGE });
  }
  if (dates.endDate < setup.endDate) {
    leaving.push({ from: maxDate(dayAfter(dates.endDate), setup.startDate), to: setup.endDate, reason: STATUS_REASON.END_DATE_CHANGE });
  }
  const joining = [];
  if (dates.startDate < setup.startDate) {
    joining.push({ from: dates.startDate, to: minDate(dayBefore(setup.startDate), dates.endDate), reason: STATUS_REASON.START_DATE_CHANGE });
  }
  if (dates.endDate > setup.endDate) {
    joining.push({ from: maxDate(dayAfter(setup.endDate), dates.startDate), to: dates.endDate, reason: STATUS_REASON.END_DATE_CHANGE });
  }
  return { leaving, joining };
};

// For the preview: how many existing classes fall outside the new dates, and how many carry a mark
const previewDateImpact = async (setup, dates) => {
  const { leaving } = dateRanges(setup, dates);
  let classes = 0;
  let marked = 0;
  for (const r of leaving) {
    if (r.from > r.to) continue;
    const ids = await getOccurrenceIdsInRange(setup._id, r.from, r.to);
    classes += ids.length;
    if (ids.length) {
      marked += await OccurrenceStatus.countDocuments({ userId: setup.ownerId, occurrenceId: { $in: ids }, status: { $in: MARKS } });
    }
  }
  return { classes, marked };
};

// Moves the student's classes and statuses to the new dates (the old range is still on `setup`).
// Repeatable: uncounted classes are skipped, restored/added ones already have their row.
const applyDateChange = async ({ setup, dates }) => {
  const setupId = setup._id;
  const userId = setup.ownerId;
  const { leaving, joining } = dateRanges(setup, dates);
  const out = { leftOut: 0, generated: 0, restored: 0, added: 0 };

  // Shorter: classes outside the new dates stop counting, marks remembered
  for (const r of leaving) {
    if (r.from > r.to) continue;
    const ids = await getOccurrenceIdsInRange(setupId, r.from, r.to);
    const res = await reconcileRangeStatuses({ occurrenceIds: ids, userId, shrinking: true, reason: r.reason, newStatus: ATTENDANCE_STATUS.PENDING });
    out.leftOut += res.uncountedIds.length;
  }

  // Longer: generate the new days for every active class, then restore or add their statuses
  if (joining.length) {
    const rules = await RecurringRule.find({ setupId, isActive: true }).lean();
    const ownEvents = await CalendarEvent.find({
      setupId,
      source: { $ne: 'official' },
      affectsClasses: true,
      confirmedAt: { $ne: null },
    }).lean();

    for (const r of joining) {
      if (r.from > r.to) continue;
      out.generated += await generateOccurrences(setupId, r.from, r.to, { rules });
      const ids = await getOccurrenceIdsInRange(setupId, r.from, r.to);
      const res = await reconcileRangeStatuses({ occurrenceIds: ids, userId, shrinking: false, reason: r.reason, newStatus: ATTENDANCE_STATUS.PENDING });
      out.restored += res.restoredIds.length;
      out.added += res.addedIds.length;

      // The student's own holidays and breaks apply to the days that were just added.
      // (Official ones are applied by step 3 over the whole new range.)
      for (const ev of ownEvents) {
        const range = { from: maxDate(ev.startDate, r.from), to: minDate(ev.endDate, r.to) };
        if (range.from > range.to) continue;
        await applyCancellation({ setupId, userId, filter: range, cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: ev._id }, skipMarked: true });
      }
    }
  }
  return out;
};

// Own classes follow the new dates. Repeatable: running it twice changes nothing the second time.
// Only plain query operators are used here (no aggregation-pipeline updates), so it works on
// every Mongoose version without the `updatePipeline` option.
const alignRuleRanges = async (setupId, setup, dates) => {
  // Wider: a class that ran for the whole old semester now runs for the whole new one
  if (dates.startDate < setup.startDate) {
    await RecurringRule.updateMany(
      { setupId, origin: { $ne: ORIGIN.OFFICIAL }, effectiveStartDate: setup.startDate },
      { $set: { effectiveStartDate: dates.startDate } }
    );
  }
  if (dates.endDate > setup.endDate) {
    await RecurringRule.updateMany(
      { setupId, origin: { $ne: ORIGIN.OFFICIAL }, effectiveEndDate: setup.endDate },
      { $set: { effectiveEndDate: dates.endDate } }
    );
  }
  // Shorter: no class runs outside the new semester.
  // Only rules that actually start before / end after the new dates are touched.
  if (dates.startDate > setup.startDate) {
    await RecurringRule.updateMany(
      { setupId, effectiveStartDate: { $lt: dates.startDate } },
      { $set: { effectiveStartDate: dates.startDate } }
    );
  }
  if (dates.endDate < setup.endDate) {
    await RecurringRule.updateMany(
      { setupId, effectiveEndDate: { $gt: dates.endDate } },
      { $set: { effectiveEndDate: dates.endDate } }
    );
  }
  // A class left with no days at all is switched off, not deleted
  await RecurringRule.updateMany({ setupId, $expr: { $gt: ['$effectiveStartDate', '$effectiveEndDate'] } }, { $set: { isActive: false } });
};

// ---------- Finding schedules ----------

// The ONLY matching rule: same academic year, semester, branch and section.
const sameScope = (setup, schedule) =>
  schedule.academicYear === setup.academicYear &&
  semesterMatches(setup.semesterLabel, schedule.semesterLabel) &&
  normalizeScopePart(schedule.branch ?? '') === normalizeScopePart(setup.branch ?? '') &&
  normalizeScopePart(schedule.section ?? '') === normalizeScopePart(setup.section ?? '');

// Every published schedule that matches the setup
const findJoinable = async ({ setup }) => {
  const schedules = await OfficialSchedule.find({
    academicYear: setup.academicYear,
    status: SCHEDULE_STATUS.PUBLISHED,
  })
    .sort({ branch: 1, section: 1 })
    .lean();
  return schedules.filter((s) => sameScope(setup, s));
};

const countByScheduleId = async (Model, ids) => {
  if (!ids.length) return new Map();
  const rows = await Model.aggregate([
    { $match: { scheduleId: { $in: ids }, status: ITEM_STATUS.ACTIVE } },
    { $group: { _id: '$scheduleId', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
};

const shapeSummary = (schedule) => ({
  id: schedule._id,
  academicYear: schedule.academicYear,
  semesterLabel: schedule.semesterLabel,
  branch: schedule.branch,
  section: schedule.section,
  groups: (schedule.groups ?? []).map((g) => ({ key: g.key, label: g.label, kind: g.kind })),
  semesterStart: dateText(schedule.semesterStart),
  semesterEnd: dateText(schedule.semesterEnd),
  contentRevision: schedule.contentRevision,
});

// The picker
const listJoinableSchedules = async ({ setup }) => {
  const schedules = await findJoinable({ setup });
  const ids = schedules.map((s) => s._id);
  const [subjects, rules] = await Promise.all([
    countByScheduleId(ScheduleSubject, ids),
    countByScheduleId(ScheduleRule, ids),
  ]);
  const current = buildScopeKey(scopeOf(setup));

  return {
    alreadyJoined: Boolean(setup.officialScheduleId),
    schedules: schedules.map((s) => ({
      ...shapeSummary(s),
      subjectCount: subjects.get(String(s._id)) ?? 0,
      classCount: rules.get(String(s._id)) ?? 0,
      // true only when the semester is worded differently ("Sem 5" vs "5th"):
      // joining then renames the setup's label to the schedule's
      changesSetupScope: buildScopeKey(scopeOf(s)) !== current,
    })),
  };
};

// none / available / joined / unavailable
const getOfficialStatus = async ({ setup }) => {
  if (setup.officialScheduleId) {
    const schedule = await OfficialSchedule.findById(setup.officialScheduleId).lean();
    const live = schedule?.status === SCHEDULE_STATUS.PUBLISHED;
    return {
      officialStatus: live ? 'joined' : 'unavailable',
      schedule: schedule ? shapeSummary(schedule) : null,
      joinedAt: setup.joinedOfficialAt,
      groups: setup.officialGroups,
      lastSyncedContentRevision: setup.lastSyncedContentRevision,
      latestRevision: schedule?.contentRevision ?? null,
    };
  }
  const joinable = await findJoinable({ setup });
  return { officialStatus: joinable.length ? 'available' : 'none', schedule: null, candidates: joinable.length };
};

// ---------- The plan (shared by the preview and the join) ----------

const loadScheduleForJoin = async ({ setup, scheduleId }) => {
  const schedule = await OfficialSchedule.findOne({ _id: scheduleId, status: SCHEDULE_STATUS.PUBLISHED }).lean();
  if (!schedule) throw new ApiError(404, 'Schedule not found');
  if (!sameScope(setup, schedule)) {
    throw new ApiError(409, 'This schedule is for a different year, semester, branch or section than your setup');
  }
  return schedule;
};

// Another active setup of yours with the target scope would collide on the unique index
const assertNoScopeCollision = async (setup, schedule) => {
  const targetKey = buildScopeKey(scopeOf(schedule));
  if (targetKey === setup.scopeKey) return;
  const clash = await Setup.findOne({ ownerId: setup.ownerId, scopeKey: targetKey, status: 'active', _id: { $ne: setup._id } })
    .select('name')
    .lean();
  if (clash) {
    throw new ApiError(409, `You already have an active setup ("${clash.name}") for this class. Archive it first.`);
  }
};

// input (already cleaned): { scheduleId, groups?, subjectMap? }
const buildPlan = async ({ setup, schedule, input }) => {
  const chosenGroups = input.groups ?? [];
  const knownGroups = new Set((schedule.groups ?? []).map((g) => g.key));
  const unknown = chosenGroups.filter((g) => !knownGroups.has(g));
  if (unknown.length) throw new ApiError(400, 'Some groups are not defined in this schedule', unknown.map((g) => `Unknown group: ${g}`));

  // The setup's dates AFTER joining. Classes are planned and clipped against these, not the old ones.
  const dates = effectiveDates(setup, schedule);

  // Read at the start: everything written up to this revision is in the data read below
  const revisionAtRead = schedule.contentRevision;
  const active = { scheduleId: schedule._id, status: ITEM_STATUS.ACTIVE };
  const [officialSubjects, officialRules, officialItems, studentSubjects] = await Promise.all([
    ScheduleSubject.find(active).lean(),
    ScheduleRule.find(active).lean(),
    ScheduleItem.find(active).lean(),
    Subject.find({ setupId: setup._id }).select('name nameKey code origin officialKey isActive').lean(),
  ]);
  const officialByKey = new Map(officialSubjects.map((s) => [s.key, s]));

  // Subjects: link, add, or suggest
  const eligible = studentSubjects.filter((s) => !s.officialKey && s.isActive !== false);
  const mapping = resolveSubjectMapping({
    officialSubjects: officialSubjects.map((s) => ({ key: s.key, name: s.name, code: s.code })),
    eligibleStudent: eligible.map((s) => ({ id: s._id, name: s.name, code: s.code })),
    allStudent: studentSubjects.map((s) => ({ id: s._id })),
    explicit: input.subjectMap ?? [],
  });
  if (mapping.errors.length) throw new ApiError(400, 'The subject choices are not valid', mapping.errors);

  // A subject added as new must not take the name or code of one the student already has
  const namesTaken = new Map(studentSubjects.map((s) => [s.nameKey, s]));
  const codesTaken = new Map(studentSubjects.filter((s) => s.code).map((s) => [s.code, s]));
  const conflicts = [];
  for (const add of mapping.adds) {
    const official = officialByKey.get(add.key);
    const byName = namesTaken.get(toNameKey(official.name));
    const byCode = official.code ? codesTaken.get(official.code) : null;
    if (byName || byCode) {
      conflicts.push(`"${official.name}" uses the same ${byName ? 'name' : 'code'} as your subject "${(byName ?? byCode).name}". Link it in subjectMap or rename yours.`);
    }
  }
  if (conflicts.length) throw new ApiError(409, 'Some official subjects clash with your own', conflicts);

  // Classes
  const subjectLinks = new Map(mapping.links.map((l) => [l.key, l.studentSubjectId]));
  const studentRules = subjectLinks.size
    ? await RecurringRule.find({ setupId: setup._id, subjectId: { $in: [...subjectLinks.values()] } }).lean()
    : [];
  const studentRulesBySubject = new Map();
  for (const r of studentRules) {
    const key = String(r.subjectId);
    if (!studentRulesBySubject.has(key)) studentRulesBySubject.set(key, []);
    studentRulesBySubject.get(key).push(r);
  }
  const rulePlan = planRuleJoin({
    officialRules,
    knownSubjectKeys: new Set(officialByKey.keys()),
    subjectLinks,
    studentRulesBySubject,
    chosenGroups,
    setupStart: dates.startDate,
    setupEnd: dates.endDate,
  });

  // Items
  const eventItems = [];
  const cancelItems = [];
  let skippedItems = 0;
  for (const item of officialItems) {
    if (!itemAppliesToStudent(item, chosenGroups)) { skippedItems += 1; continue; }
    if (EVENT_KINDS.has(item.kind)) eventItems.push(item);
    else if (CANCEL_KINDS.has(item.kind)) cancelItems.push(item);
  }

  return { schedule, chosenGroups, dates, revisionAtRead, officialSubjects, officialByKey, mapping, rulePlan, eventItems, cancelItems, skippedItems };
};

// ---------- Preview (writes nothing) ----------

// `range` is anything with startDate and endDate: the setup, or the dates it will have after joining
const clipToSetup = (range, from, to) => ({
  from: from > range.startDate ? from : range.startDate,
  to: to < range.endDate ? to : range.endDate,
});

// How many existing classes an official cancellation would hold, and how many carry a mark
const previewLock = async (setup, userId, filter, cause) => {
  const plan = await planCancellation({ setupId: setup._id, userId, filter, cause });
  const marked = plan.toCancel.filter((c) => c.mode === 'new' && MARKS.includes(c.previousStatus)).length;
  return { classes: plan.toCancel.length, marked };
};

const previewJoin = async ({ setup, input }) => {
  assertSetupOpen(setup);
  assertNotJoined(setup);
  const schedule = await loadScheduleForJoin({ setup, scheduleId: input.scheduleId });
  await assertNoScopeCollision(setup, schedule);
  const plan = await buildPlan({ setup, schedule, input });
  const { mapping, rulePlan, officialByKey, dates } = plan;

  const warnings = [];
  const from = scopeOf(setup);
  const to = scopeOf(schedule);
  const scopeChange = buildScopeKey(from) === buildScopeKey(to) ? null : { from, to };
  if (scopeChange) warnings.push(`Joining changes your setup to ${to.branch} ${to.section}, ${to.semesterLabel}.`);

  // Semester dates: they follow the official schedule when it sets them
  let dateChange = null;
  if (datesChange(setup, dates)) {
    const impact = await previewDateImpact(setup, dates);
    dateChange = {
      from: { startDate: dateText(setup.startDate), endDate: dateText(setup.endDate) },
      to: { startDate: dateText(dates.startDate), endDate: dateText(dates.endDate) },
      classesLeftOut: impact.classes,
      markedClassesLeftOut: impact.marked,
    };
    warnings.push(`Joining changes your semester dates to ${dateChange.to.startDate} - ${dateChange.to.endDate}, to match the official schedule.`);
    if (impact.classes) {
      warnings.push(`${impact.classes} of your classes (${impact.marked} with a mark) fall outside the new dates. They stop counting toward attendance. Their marks are kept and come back if the dates are widened again.`);
    }
  }

  // Locks: existing classes only. Classes a new weekly class creates start out cancelled by the same items.
  const locks = [];
  for (const item of plan.eventItems.filter((i) => i.affectsClasses)) {
    const range = clipToSetup(dates, item.startDate, item.endDate);
    if (range.from > range.to) continue;
    const r = await previewLock(setup, setup.ownerId, range, { type: CAUSE_TYPE.CALENDAR_EVENT, id: item._id });
    locks.push({ title: item.title, kind: item.kind, ...r });
  }
  const noIds = new Map(); // a subject added as new has no classes yet, so it matches nothing now
  const subjectIdByKey = new Map(mapping.links.map((l) => [l.key, l.studentSubjectId]));
  for (const item of plan.cancelItems) {
    const filter = buildCancelFilter(item, subjectIdByKey) ?? (item.subjectKey ? null : buildCancelFilter(item, noIds));
    if (!filter) continue;
    const type = item.kind === 'mass_bunk' ? CAUSE_TYPE.MASS_BUNK : CAUSE_TYPE.CLASS_CANCEL;
    const r = await previewLock(setup, setup.ownerId, filter, { type, id: item._id });
    locks.push({ title: item.title, kind: item.kind, ...r });
  }
  const lockedClasses = locks.reduce((sum, l) => sum + l.classes, 0);
  const lockedMarked = locks.reduce((sum, l) => sum + l.marked, 0);
  if (lockedMarked) {
    warnings.push(`${lockedMarked} class(es) you already marked fall on an official holiday, exam or cancellation. They will be cancelled and locked. Your marks are kept and come back if the cancellation is withdrawn.`);
  }
  if (mapping.suggestions.length) {
    warnings.push(`${mapping.suggestions.length} subject(s) look like ones you already have. Choose them in subjectMap to link them, or they will be added as new.`);
  }
  if (rulePlan.skipped.group) warnings.push(`${rulePlan.skipped.group} class(es) are for groups you did not pick and were left out.`);
  if (rulePlan.skipped.range) warnings.push(`${rulePlan.skipped.range} class(es) fall outside the semester dates and were left out.`);

  const byKind = {};
  for (const item of [...plan.eventItems, ...plan.cancelItems]) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  const newClasses = rulePlan.add.reduce((sum, a) => sum + countRuleClasses(a.rule.weekday, a.range.start, a.range.end), 0);

  return {
    schedule: shapeSummary(schedule),
    scopeChange,
    dateChange,
    groups: { available: shapeSummary(schedule).groups, chosen: plan.chosenGroups },
    subjects: {
      linked: mapping.links.map((l) => ({
        key: l.key,
        name: officialByKey.get(l.key).name,
        studentSubjectId: l.studentSubjectId,
        how: l.how,
      })),
      added: mapping.adds.map((a) => ({ key: a.key, name: officialByKey.get(a.key).name })),
      suggestions: mapping.suggestions.map((s) => ({ ...s, name: officialByKey.get(s.key).name })),
    },
    classes: {
      linked: rulePlan.link.length,
      added: rulePlan.add.length,
      newClassesToCreate: newClasses,
      skipped: rulePlan.skipped,
    },
    calendar: { items: plan.eventItems.length + plan.cancelItems.length, byKind, skippedForOtherGroups: plan.skippedItems },
    locked: { classes: lockedClasses, markedClasses: lockedMarked, items: locks.slice(0, 20) },
    warnings,
  };
};

// ---------- Join ----------

const ensureOfficialEvent = async ({ setup, item }) => {
  const filter = { setupId: setup._id, 'officialRef.id': item._id };
  const existing = await CalendarEvent.findOne(filter);
  if (existing) return existing;
  try {
    return await CalendarEvent.create({
      setupId: setup._id,
      title: item.title,
      type: item.kind, // the six event kinds are also event types
      startDate: item.startDate,
      endDate: item.endDate,
      startTime: item.startTime ?? undefined,
      endTime: item.endTime ?? undefined,
      affectsClasses: item.affectsClasses,
      note: item.note || undefined,
      source: 'official',
      confirmedAt: new Date(),
      officialRef: { kind: 'item', id: item._id },
      followOfficial: true,
      officialRevisionSeen: item.revision,
    });
  } catch (err) {
    if (err?.code === 11000) return CalendarEvent.findOne(filter); // a retry that raced itself
    throw err;
  }
};

const executeJoin = async ({ setup, plan }) => {
  const { schedule, chosenGroups, dates, mapping, rulePlan, officialByKey } = plan;
  const setupId = setup._id;
  const userId = setup.ownerId;
  const changed = datesChange(setup, dates); // setup still holds the OLD dates until step 4
  const summary = {
    subjectsLinked: 0,
    subjectsAdded: 0,
    classesLinked: 0,
    classesAdded: 0,
    newClasses: 0,
    events: 0,
    cancellations: 0,
    datesChanged: changed,
    classesLeftOut: 0,
    classesRestored: 0,
  };

  // 1. Subjects. Adds are upserts on (setup, officialKey), so a retry never duplicates one.
  for (const link of mapping.links) {
    const o = officialByKey.get(link.key);
    await Subject.updateOne(
      { _id: link.studentSubjectId, setupId },
      { $set: { origin: ORIGIN.OFFICIAL, officialKey: o.key, officialRevisionSeen: o.revision, officialDetached: false } }
    );
    summary.subjectsLinked += 1;
  }
  for (const add of mapping.adds) {
    const o = officialByKey.get(add.key);
    await Subject.updateOne(
      { setupId, officialKey: o.key },
      {
        $setOnInsert: {
          name: o.name,
          nameKey: toNameKey(o.name),
          ...(o.code ? { code: o.code } : {}),
          targetPercentage: null,
          isActive: true,
          origin: ORIGIN.OFFICIAL,
          officialRevisionSeen: o.revision,
          officialDetached: false,
        },
      },
      { upsert: true }
    );
    summary.subjectsAdded += 1;
  }
  const subjectRows = await Subject.find({ setupId, officialKey: { $in: [...officialByKey.keys()] } }).select('officialKey').lean();
  const subjectIdByKey = new Map(subjectRows.map((s) => [s.officialKey, String(s._id)]));

  // 1b. Own classes follow the new dates BEFORE official classes are added, so those are never touched by it
  if (changed) await alignRuleRanges(setupId, setup, dates);

  // 2. Classes: link the ones the student already has, add the rest, then create their classes
  for (const { rule, studentRule } of rulePlan.link) {
    await RecurringRule.updateOne(
      { _id: studentRule._id, setupId },
      { $set: { origin: ORIGIN.OFFICIAL, officialRuleId: rule._id, officialRevisionSeen: rule.revision, detachedFromOfficial: false } }
    );
    summary.classesLinked += 1;
  }
  const created = [];
  for (const { rule, range } of rulePlan.add) {
    const doc = await RecurringRule.findOneAndUpdate(
      { setupId, officialRuleId: rule._id },
      {
        $setOnInsert: {
          subjectId: subjectIdByKey.get(rule.subjectKey),
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          effectiveStartDate: range.start,
          effectiveEndDate: range.end,
          classType: rule.classType,
          group: rule.group ?? null,
          ...(rule.room ? { room: rule.room } : {}),
          ...(rule.professor ? { professor: rule.professor } : {}),
          attendanceUnits: rule.attendanceUnits,
          isActive: true,
          ruleVersion: 1,
          origin: ORIGIN.OFFICIAL,
          officialRevisionSeen: rule.revision,
          detachedFromOfficial: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    created.push(doc);
    summary.classesAdded += 1;
  }

  // Occurrences for the official classes created above, over the dates the setup will have
  if (created.length) {
    summary.newClasses = await generateOccurrences(setupId, dates.startDate, dates.endDate, { rules: created });
  }
  // Dates moved: statuses and new days for the student's other classes
  if (changed) {
    const r = await applyDateChange({ setup, dates });
    summary.newClasses += r.generated;
    summary.classesLeftOut = r.leftOut;
    summary.classesRestored = r.restored;
  }

  // 3. Calendar items. Official cancellations apply to every class, marked or not (no skipMarked).
  for (const item of plan.eventItems) {
    const event = await ensureOfficialEvent({ setup, item });
    summary.events += 1;
    if (event.affectsClasses) {
      const range = clipToSetup(dates, event.startDate, event.endDate);
      if (range.from <= range.to) {
        const r = await applyCancellation({ setupId, userId, filter: range, cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id } });
        summary.cancellations += r.cancelled;
      }
    }
  }
  for (const item of plan.cancelItems) {
    const filter = buildCancelFilter(item, subjectIdByKey);
    if (!filter) continue;
    const type = item.kind === 'mass_bunk' ? CAUSE_TYPE.MASS_BUNK : CAUSE_TYPE.CLASS_CANCEL;
    const r = await applyCancellation({ setupId, userId, filter, cause: { type, id: item._id } });
    summary.cancellations += r.cancelled;
  }

  // 4. The link, last. Scope, dates, link and groups are saved together, in one write.
  const fresh = await Setup.findById(setupId);
  if (fresh.officialScheduleId && String(fresh.officialScheduleId) !== String(schedule._id)) {
    throw new ApiError(409, 'This setup joined another schedule in the meantime');
  }
  fresh.set({
    ...scopeOf(schedule),
    startDate: dates.startDate,
    endDate: dates.endDate,
    officialScheduleId: schedule._id,
    joinedOfficialAt: fresh.joinedOfficialAt ?? new Date(),
    officialGroups: chosenGroups,
    // Everything up to this revision has been applied above. The sync re-reads a small window
    // before it, so a change that was still being written at this moment is not missed.
    lastSyncedContentRevision: plan.revisionAtRead,
    officialOptOuts: [],
  });
  try {
    await fresh.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'You already have an active setup for this class. Archive it first.');
    }
    throw err;
  }
  return { setup: fresh, summary };
};

// input (already cleaned): { scheduleId, groups?, subjectMap?, confirm: true }
const joinSchedule = async ({ setup, input }) => {
  assertSetupOpen(setup);
  assertNotJoined(setup);
  const schedule = await loadScheduleForJoin({ setup, scheduleId: input.scheduleId });
  await assertNoScopeCollision(setup, schedule);
  const plan = await buildPlan({ setup, schedule, input });
  const { setup: joined, summary } = await executeJoin({ setup, plan });

  return {
    joined: true,
    schedule: shapeSummary(schedule),
    setup: {
      id: joined._id,
      academicYear: joined.academicYear,
      semesterLabel: joined.semesterLabel,
      branch: joined.branch,
      section: joined.section,
      startDate: dateText(joined.startDate),
      endDate: dateText(joined.endDate),
      officialGroups: joined.officialGroups,
    },
    summary,
  };
};

// ---------- Leave ----------

// Clears the link and keeps all the content. Official events become the student's own, so the
// classes they cancelled can be marked again. Cancellations by a mass bunk or class cancel become
// the student's own cancellations. Every step is repeatable, and the link goes last.
// The semester dates stay as they are: they are the student's own again.
// Also called when the student changes the scope of a joined setup (updateSetupDetails).
const leaveSchedule = async ({ setup }) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
  if (!setup.officialScheduleId) throw new ApiError(409, 'This setup is not following an official schedule');
  const setupId = setup._id;

  const events = await CalendarEvent.updateMany(
    { setupId, source: 'official' },
    {
      $set: { source: 'manual', followOfficial: false },
      $unset: { officialRef: 1, officialRevisionSeen: 1, officialWithdrawn: 1, lastAutoUpdate: 1 },
    }
  );
  const cancels = await OccurrenceStatus.updateMany(
    { setupId, causeType: { $in: [CAUSE_TYPE.MASS_BUNK, CAUSE_TYPE.CLASS_CANCEL] } },
    { $set: { causeType: null, causeId: null, source: STATUS_SOURCE.USER } }
  );
  const rules = await RecurringRule.updateMany(
    { setupId, origin: ORIGIN.OFFICIAL },
    { $set: { origin: ORIGIN.MANUAL, officialRuleId: null, officialRevisionSeen: null, detachedFromOfficial: false } }
  );
  const subjects = await Subject.updateMany(
    { setupId, origin: ORIGIN.OFFICIAL },
    { $set: { origin: ORIGIN.MANUAL, officialRevisionSeen: 0, officialDetached: false }, $unset: { officialKey: 1 } }
  );
  // Waiting official changes no longer mean anything once the link is gone
  await SetupOfficialUpdate.deleteMany({ setupId, status: 'pending' });

  setup.set({
    officialScheduleId: null,
    joinedOfficialAt: null,
    officialGroups: [],
    lastSyncedContentRevision: 0,
    officialOptOuts: [],
  });
  await setup.save();

  return {
    left: true,
    eventsNowYours: events.modifiedCount,
    cancellationsNowYours: cancels.modifiedCount,
    classesNowYours: rules.modifiedCount,
    subjectsNowYours: subjects.modifiedCount,
  };
};

export {
  listJoinableSchedules,
  getOfficialStatus,
  previewJoin,
  joinSchedule,
  leaveSchedule,
  ensureOfficialEvent,
  clipToSetup,
};