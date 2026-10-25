import OfficialSchedule from '../models/Official/officialSchedule.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import SetupOfficialUpdate, {
  UPDATE_TARGET,
  UPDATE_CHANGE,
  UPDATE_STATUS,
} from '../models/Official/setupOfficialUpdate.model.js';
import Setup from '../models/TimeTable/setup.model.js';
import Subject, { toNameKey } from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import { suggestMatches } from '../utils/subjectMatch.js';
import { ruleKey } from '../utils/subjectMergePlan.js';
import {
  EVENT_KINDS,
  CANCEL_KINDS,
  clampRuleRange,
  itemAppliesToStudent,
  buildCancelFilter,
} from '../utils/officialJoinRules.js';
import {
  syncWindowStart,
  optOutSet,
  isOptedOut,
  diffRuleAgainstStudent,
  ruleProposal,
  describeOfficialRule,
  eventPatchFromItem,
  eventNeedsUpdate,
} from '../utils/officialSyncRules.js';
import { generateOccurrences } from './occurrence.service.js';
import { applyCancellation, revertCause } from './cancellation.service.js';
import { updateEvent, deleteEvent } from './calendarEvent.service.js';
import { ensureOfficialEvent, clipToSetup } from './officialJoin.service.js';
import {
  CAUSE_TYPE,
  ITEM_STATUS,
  ORIGIN,
  SCHEDULE_STATUS,
  SYNC_OVERLAP_REVISIONS,
} from '../utils/constants.js';

// Sync on read: when a student opens their setup, compare two numbers (the schedule's
// contentRevision and the setup's lastSyncedContentRevision). If they match, nothing happens.
// Otherwise apply what the CR changed since, to THIS student's records only.
//
//   subjects          new ones are added (or linked if the name or code is exactly the same),
//                     renamed ones follow unless the student edited them
//   weekly classes    new ones are added with their classes; a CHANGED or REMOVED one waits in the
//                     student's Official updates list
//   dates and exams   holidays, breaks, exams, quizzes and events are created and kept in line;
//                     withdrawn ones are removed and their classes are restored
//   mass bunk and class cancel   applied to every class they name; withdrawn ones are restored
//
// Official cancellations apply to marked classes too (the earlier mark is remembered and comes
// back). The student's own edits, hidden items and groups they did not pick are respected.
// Every step is repeatable, and lastSyncedContentRevision is written LAST, so a sync that stops
// halfway simply runs again on the next read.

const newSummary = () => ({
  subjects: { added: 0, linked: 0, updated: 0, conflicts: 0 },
  classes: { added: 0, newClasses: 0, changesWaiting: 0, removalsWaiting: 0 },
  calendar: { added: 0, updated: 0, withdrawn: 0 },
  cancellations: { applied: 0, restored: 0 },
  updates: 0,
});

// One line in the student's Official updates list. The unique index makes a repeated sync a no-op,
// and a line the student dismissed is never recreated for the same revision.
const recordUpdate = async (ctx, { targetKind, targetId, change, revision, status, summary, proposed = null, data = null }) => {
  const result = await SetupOfficialUpdate.updateOne(
    { setupId: ctx.setup._id, targetKind, targetId, change, revision },
    { $setOnInsert: { ownerId: ctx.userId, scheduleId: ctx.schedule._id, status, summary, proposed, data } },
    { upsert: true }
  );
  if (!result.upsertedCount) return;
  ctx.summary.updates += 1;
  if (status === UPDATE_STATUS.PENDING) {
    // A newer pending change replaces the older ones for the same record
    await SetupOfficialUpdate.updateMany(
      { setupId: ctx.setup._id, targetKind, targetId, status: UPDATE_STATUS.PENDING, revision: { $lt: revision } },
      { $set: { status: UPDATE_STATUS.SUPERSEDED } }
    );
  }
};

// ---------- Subjects ----------

const syncSubjects = async (ctx, officialSubjects) => {
  const { setup, summary } = ctx;
  if (!officialSubjects.length) return;

  const rows = await Subject.find({ setupId: setup._id })
    .select('name nameKey code origin officialKey officialRevisionSeen officialDetached isActive')
    .lean();
  const byKey = new Map(rows.filter((r) => r.officialKey).map((r) => [r.officialKey, r]));
  const names = new Map(rows.map((r) => [r.nameKey, r]));
  const codes = new Map(rows.filter((r) => r.code).map((r) => [r.code, r]));
  let eligible = rows.filter((r) => !r.officialKey && r.isActive !== false);

  const takenBy = (nameKey, code, selfId) => {
    const byName = names.get(nameKey);
    const byCode = code ? codes.get(code) : null;
    const other = [byName, byCode].find((r) => r && String(r._id) !== String(selfId));
    return other ?? null;
  };

  for (const s of officialSubjects) {
    if (isOptedOut(ctx.optOuts, 'subject', s._id)) continue;
    if (s.status === ITEM_STATUS.WITHDRAWN) continue; // the student keeps their copy
    const nameKey = toNameKey(s.name);
    const existing = byKey.get(s.key);

    if (existing) {
      if (existing.officialDetached || (existing.officialRevisionSeen ?? 0) >= s.revision) continue;
      const clash = takenBy(nameKey, s.code, existing._id);
      if (clash) {
        await recordUpdate(ctx, {
          targetKind: UPDATE_TARGET.SUBJECT, targetId: s._id, change: UPDATE_CHANGE.CONFLICT, revision: s.revision,
          status: UPDATE_STATUS.PENDING,
          summary: `Your CR renamed "${existing.name}" to "${s.name}", but you already have "${clash.name}". Merge or rename one of them.`,
        });
        summary.subjects.conflicts += 1;
        continue;
      }
      const update = { $set: { name: s.name, nameKey, officialRevisionSeen: s.revision } };
      if (s.code) update.$set.code = s.code;
      else update.$unset = { code: 1 };
      await Subject.updateOne({ _id: existing._id }, update);
      names.delete(existing.nameKey);
      names.set(nameKey, { ...existing, name: s.name, nameKey });
      if (existing.name !== s.name || (existing.code ?? null) !== (s.code ?? null)) {
        await recordUpdate(ctx, {
          targetKind: UPDATE_TARGET.SUBJECT, targetId: s._id, change: UPDATE_CHANGE.UPDATED, revision: s.revision,
          status: UPDATE_STATUS.APPLIED, summary: `Subject renamed to "${s.name}"`,
        });
        summary.subjects.updated += 1;
      }
      continue;
    }

    // A new official subject: link an exact match the student already has, otherwise add it
    const exact = suggestMatches(
      [{ key: s.key, name: s.name, code: s.code }],
      eligible.map((r) => ({ id: r._id, name: r.name, code: r.code }))
    ).matches[0];
    if (exact.studentSubjectId && exact.level === 'exact') {
      await Subject.updateOne(
        { _id: exact.studentSubjectId, setupId: setup._id },
        { $set: { origin: ORIGIN.OFFICIAL, officialKey: s.key, officialRevisionSeen: s.revision, officialDetached: false } }
      );
      eligible = eligible.filter((r) => String(r._id) !== String(exact.studentSubjectId));
      byKey.set(s.key, { _id: exact.studentSubjectId });
      await recordUpdate(ctx, {
        targetKind: UPDATE_TARGET.SUBJECT, targetId: s._id, change: UPDATE_CHANGE.ADDED, revision: s.revision,
        status: UPDATE_STATUS.APPLIED, summary: `Your subject was linked to the official "${s.name}"`,
      });
      summary.subjects.linked += 1;
      continue;
    }

    const clash = takenBy(nameKey, s.code, null);
    if (clash) {
      await recordUpdate(ctx, {
        targetKind: UPDATE_TARGET.SUBJECT, targetId: s._id, change: UPDATE_CHANGE.CONFLICT, revision: s.revision,
        status: UPDATE_STATUS.PENDING,
        summary: `Your CR added "${s.name}", but you already have "${clash.name}" with the same name or code. Merge or rename yours.`,
      });
      summary.subjects.conflicts += 1;
      continue;
    }
    await Subject.updateOne(
      { setupId: setup._id, officialKey: s.key },
      {
        $setOnInsert: {
          name: s.name, nameKey, ...(s.code ? { code: s.code } : {}), targetPercentage: null, isActive: true,
          origin: ORIGIN.OFFICIAL, officialRevisionSeen: s.revision, officialDetached: false,
        },
      },
      { upsert: true }
    );
    names.set(nameKey, { name: s.name, nameKey });
    if (s.code) codes.set(s.code, { name: s.name });
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.SUBJECT, targetId: s._id, change: UPDATE_CHANGE.ADDED, revision: s.revision,
      status: UPDATE_STATUS.APPLIED, summary: `Subject added: "${s.name}"`,
    });
    summary.subjects.added += 1;
  }
};

// official subject key -> { id, name } of the student's subject
const loadSubjectMap = async (setup) => {
  const rows = await Subject.find({ setupId: setup._id, officialKey: { $exists: true } }).select('officialKey name').lean();
  return new Map(rows.map((r) => [r.officialKey, { id: String(r._id), name: r.name }]));
};

// ---------- Classes ----------

// New classes may land on a holiday, exam, mass bunk or class cancel that already exists
const reapplyCancellationsTo = async (ctx, ruleIds) => {
  const { setup, userId } = ctx;
  const classes = await Occurrence.find({ setupId: setup._id, recurringRuleId: { $in: ruleIds } }).select('date').lean();
  if (!classes.length) return;
  const ids = classes.map((c) => c._id);
  const times = classes.map((c) => c.date.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));

  const events = await CalendarEvent.find({
    setupId: setup._id, confirmedAt: { $ne: null }, affectsClasses: true, startDate: { $lte: to }, endDate: { $gte: from },
  })
    .sort({ startDate: 1, _id: 1 })
    .lean();
  for (const event of events) {
    await applyCancellation({
      setupId: setup._id, userId,
      filter: { from: event.startDate > from ? event.startDate : from, to: event.endDate < to ? event.endDate : to, occurrenceIds: ids },
      cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id },
    });
  }

  const items = await ScheduleItem.find({
    scheduleId: ctx.schedule._id, status: ITEM_STATUS.ACTIVE, kind: { $in: [...CANCEL_KINDS] },
    startDate: { $lte: to }, endDate: { $gte: from },
  }).lean();
  for (const item of items) {
    if (isOptedOut(ctx.optOuts, 'item', item._id) || !itemAppliesToStudent(item, ctx.groups)) continue;
    const filter = buildCancelFilter(item, ctx.subjectIdByKey);
    if (!filter) continue;
    await applyCancellation({
      setupId: setup._id, userId, filter: { ...filter, occurrenceIds: ids },
      cause: { type: item.kind === 'mass_bunk' ? CAUSE_TYPE.MASS_BUNK : CAUSE_TYPE.CLASS_CANCEL, id: item._id },
    });
  }
};

const syncRules = async (ctx, officialRules) => {
  const { setup, summary } = ctx;
  if (!officialRules.length) return;

  const existingRows = await RecurringRule.find({ setupId: setup._id, officialRuleId: { $in: officialRules.map((r) => r._id) } }).lean();
  const existingByOfficial = new Map(existingRows.map((r) => [String(r.officialRuleId), r]));
  const studentOwn = await RecurringRule.find({ setupId: setup._id, origin: { $ne: ORIGIN.OFFICIAL } }).lean();
  const claimed = new Set();
  const created = [];

  for (const rule of officialRules) {
    if (isOptedOut(ctx.optOuts, 'rule', rule._id)) continue;
    const existing = existingByOfficial.get(String(rule._id));
    const subject = ctx.subjectInfo.get(rule.subjectKey);
    const subjectName = subject?.name ?? 'Class';

    if (rule.status === ITEM_STATUS.WITHDRAWN) {
      if (existing && !existing.detachedFromOfficial && existing.isActive) {
        await recordUpdate(ctx, {
          targetKind: UPDATE_TARGET.RULE, targetId: rule._id, change: UPDATE_CHANGE.WITHDRAWN, revision: rule.revision,
          status: UPDATE_STATUS.PENDING,
          summary: `Your CR removed ${describeOfficialRule(rule, subjectName)}. Remove it from your timetable too?`,
        });
        summary.classes.removalsWaiting += 1;
      }
      continue;
    }
    if (rule.group && !ctx.groups.includes(rule.group)) continue;

    if (existing) {
      if (existing.detachedFromOfficial || (existing.officialRevisionSeen ?? 0) >= rule.revision) continue;
      const changed = diffRuleAgainstStudent(rule, existing, { setupStart: setup.startDate, setupEnd: setup.endDate });
      if (!changed.length) {
        await RecurringRule.updateOne({ _id: existing._id }, { $set: { officialRevisionSeen: rule.revision } });
      } else {
        await recordUpdate(ctx, {
          targetKind: UPDATE_TARGET.RULE, targetId: rule._id, change: UPDATE_CHANGE.UPDATED, revision: rule.revision,
          status: UPDATE_STATUS.PENDING,
          summary: `Your CR changed ${describeOfficialRule(rule, subjectName)} (${changed.join(', ')})`,
          proposed: ruleProposal(rule), data: { changedFields: changed, studentRuleId: existing._id },
        });
        summary.classes.changesWaiting += 1;
      }
      continue;
    }

    // A class that is new to this student
    if (!subject) continue; // its subject was hidden, or could not be added
    const range = clampRuleRange(rule, setup.startDate, setup.endDate);
    if (!range) continue;

    // The same class the student already has is linked, not copied
    const twin = studentOwn.find(
      (r) => !claimed.has(String(r._id)) && String(r.subjectId) === subject.id && ruleKey(r) === ruleKey(rule)
    );
    if (twin) {
      claimed.add(String(twin._id));
      await RecurringRule.updateOne(
        { _id: twin._id },
        { $set: { origin: ORIGIN.OFFICIAL, officialRuleId: rule._id, officialRevisionSeen: rule.revision, detachedFromOfficial: false } }
      );
      continue;
    }

    const doc = await RecurringRule.findOneAndUpdate(
      { setupId: setup._id, officialRuleId: rule._id },
      {
        $setOnInsert: {
          subjectId: subject.id, weekday: rule.weekday, startTime: rule.startTime, endTime: rule.endTime,
          effectiveStartDate: range.start, effectiveEndDate: range.end, classType: rule.classType, group: rule.group ?? null,
          ...(rule.room ? { room: rule.room } : {}), ...(rule.professor ? { professor: rule.professor } : {}),
          attendanceUnits: rule.attendanceUnits, isActive: true, ruleVersion: 1,
          origin: ORIGIN.OFFICIAL, officialRevisionSeen: rule.revision, detachedFromOfficial: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    created.push(doc);
    summary.classes.added += 1;
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.RULE, targetId: rule._id, change: UPDATE_CHANGE.ADDED, revision: rule.revision,
      status: UPDATE_STATUS.APPLIED, summary: `Class added: ${describeOfficialRule(rule, subjectName)}`,
    });
  }

  if (created.length) {
    summary.classes.newClasses += await generateOccurrences(setup._id, setup.startDate, setup.endDate, { rules: created });
    await reapplyCancellationsTo(ctx, created.map((r) => r._id));
  }
};

// ---------- Calendar items ----------

const syncEventItem = async (ctx, item) => {
  const { setup, userId, summary } = ctx;
  const event = await CalendarEvent.findOne({ setupId: setup._id, 'officialRef.id': item._id });

  if (item.status === ITEM_STATUS.WITHDRAWN) {
    if (!event) return;
    await deleteEvent({ setup, userId, event }); // gives the classes it cancelled their marks back
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.ITEM, targetId: item._id, change: UPDATE_CHANGE.WITHDRAWN, revision: item.revision,
      status: UPDATE_STATUS.APPLIED, summary: `Withdrawn by your CR: ${item.title}`,
    });
    summary.calendar.withdrawn += 1;
    return;
  }

  if (!event) {
    const created = await ensureOfficialEvent({ setup, item });
    if (created.affectsClasses) {
      const range = clipToSetup(setup, created.startDate, created.endDate);
      if (range.from <= range.to) {
        const r = await applyCancellation({ setupId: setup._id, userId, filter: range, cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: created._id } });
        summary.cancellations.applied += r.cancelled;
      }
    }
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.ITEM, targetId: item._id, change: UPDATE_CHANGE.ADDED, revision: item.revision,
      status: UPDATE_STATUS.APPLIED, summary: `Added to your calendar: ${item.title}`,
    });
    summary.calendar.added += 1;
    return;
  }

  // The student's own edit (a quiz they moved) wins
  if (!event.followOfficial || (event.officialRevisionSeen ?? 0) >= item.revision) return;
  if (eventNeedsUpdate(event, item)) {
    const before = {
      startDate: event.startDate, endDate: event.endDate, startTime: event.startTime ?? null, endTime: event.endTime ?? null,
    };
    await updateEvent({ setup, userId, event, input: eventPatchFromItem(item) });
    await CalendarEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          officialRevisionSeen: item.revision,
          lastAutoUpdate: {
            from: before,
            to: { startDate: item.startDate, endDate: item.endDate, startTime: item.startTime ?? null, endTime: item.endTime ?? null },
            at: new Date(),
          },
        },
      }
    );
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.ITEM, targetId: item._id, change: UPDATE_CHANGE.UPDATED, revision: item.revision,
      status: UPDATE_STATUS.APPLIED, summary: `Updated by your CR: ${item.title}`,
    });
    summary.calendar.updated += 1;
  } else {
    await CalendarEvent.updateOne({ _id: event._id }, { $set: { officialRevisionSeen: item.revision } });
  }
};

const syncCancelItem = async (ctx, item) => {
  const { setup, userId, summary } = ctx;
  const type = item.kind === 'mass_bunk' ? CAUSE_TYPE.MASS_BUNK : CAUSE_TYPE.CLASS_CANCEL;
  const cause = { type, id: item._id };

  if (item.status === ITEM_STATUS.WITHDRAWN) {
    const r = await revertCause({ setupId: setup._id, userId, cause });
    if (r.total) {
      await recordUpdate(ctx, {
        targetKind: UPDATE_TARGET.ITEM, targetId: item._id, change: UPDATE_CHANGE.WITHDRAWN, revision: item.revision,
        status: UPDATE_STATUS.APPLIED, summary: `Withdrawn by your CR: ${item.title}. ${r.total} class(es) were restored.`,
        data: { restored: r.total },
      });
      summary.cancellations.restored += r.total;
    }
    return;
  }

  const filter = buildCancelFilter(item, ctx.subjectIdByKey);
  if (!filter) return;
  // New or changed since the student last synced: drop the old footprint first, so a changed range
  // is exact. An item only seen again through the overlap window is just applied (it adds what
  // was missed and changes nothing else).
  const isNewOrChanged = item.revision > ctx.lastSeen;
  let hadBefore = 0;
  if (isNewOrChanged) hadBefore = (await revertCause({ setupId: setup._id, userId, cause })).total;

  const r = await applyCancellation({ setupId: setup._id, userId, filter, cause });
  summary.cancellations.applied += r.cancelled;
  if (isNewOrChanged && (r.cancelled || hadBefore)) {
    await recordUpdate(ctx, {
      targetKind: UPDATE_TARGET.ITEM, targetId: item._id, change: hadBefore ? UPDATE_CHANGE.UPDATED : UPDATE_CHANGE.ADDED,
      revision: item.revision, status: UPDATE_STATUS.APPLIED,
      summary: `${item.title}: ${r.cancelled} class(es) cancelled`, data: { cancelled: r.cancelled },
    });
  }
};

const syncItems = async (ctx, items) => {
  // Calendar events first, so a mass bunk sees the classes a holiday already holds
  const ordered = [...items].sort((a, b) => Number(CANCEL_KINDS.has(a.kind)) - Number(CANCEL_KINDS.has(b.kind)));
  for (const item of ordered) {
    if (isOptedOut(ctx.optOuts, 'item', item._id)) continue;
    if (!itemAppliesToStudent(item, ctx.groups)) continue;
    if (EVENT_KINDS.has(item.kind)) await syncEventItem(ctx, item);
    else if (CANCEL_KINDS.has(item.kind)) await syncCancelItem(ctx, item);
  }
};

// ---------- Entry point ----------

// Returns null (nothing to do), { status: 'unavailable' }, { status: 'current' } or { status: 'synced', ... }
const syncSetup = async ({ setup }) => {
  if (!setup.officialScheduleId || setup.status === 'archived') return null;

  const schedule = await OfficialSchedule.findById(setup.officialScheduleId).select('status contentRevision groups').lean();
  if (!schedule || schedule.status !== SCHEDULE_STATUS.PUBLISHED) return { status: 'unavailable' };

  const target = schedule.contentRevision;
  const lastSeen = setup.lastSyncedContentRevision ?? 0;
  if (lastSeen >= target) return { status: 'current' };

  const from = syncWindowStart(lastSeen, SYNC_OVERLAP_REVISIONS);
  const changed = { scheduleId: schedule._id, revision: { $gt: from } };
  const [subjects, rules, items] = await Promise.all([
    ScheduleSubject.find(changed).sort({ revision: 1 }).lean(),
    ScheduleRule.find(changed).sort({ revision: 1 }).lean(),
    ScheduleItem.find(changed).sort({ revision: 1 }).lean(),
  ]);

  const ctx = {
    setup, schedule, userId: setup.ownerId, lastSeen,
    groups: setup.officialGroups ?? [],
    optOuts: optOutSet(setup.officialOptOuts),
    summary: newSummary(),
    subjectInfo: new Map(), // official subject key -> { id, name } (what the classes need)
    subjectIdByKey: new Map(), // official subject key -> id (what the cancel filters need)
  };

  await syncSubjects(ctx, subjects);
  // read after the subjects step, so a subject added just now is included
  ctx.subjectInfo = await loadSubjectMap(setup);
  ctx.subjectIdByKey = new Map([...ctx.subjectInfo].map(([key, v]) => [key, v.id]));
  await syncRules(ctx, rules);
  await syncItems(ctx, items);

  // Last: if anything above failed, the next read starts again from the same place
  await Setup.updateOne({ _id: setup._id }, { $max: { lastSyncedContentRevision: target } });
  setup.lastSyncedContentRevision = Math.max(lastSeen, target);

  return { status: 'synced', fromRevision: from, toRevision: target, ...ctx.summary };
};

// ---------- The Official updates list ----------

// query (already cleaned): { status: 'all' | one of the statuses, limit }
const listOfficialUpdates = async ({ setup, query }) => {
  const filter = { setupId: setup._id };
  if (query.status !== 'all') filter.status = query.status;
  const [updates, pending] = await Promise.all([
    SetupOfficialUpdate.find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit).lean(),
    SetupOfficialUpdate.countDocuments({ setupId: setup._id, status: UPDATE_STATUS.PENDING }),
  ]);
  return {
    pendingCount: pending,
    updates: updates.map((u) => ({
      id: u._id,
      targetKind: u.targetKind,
      targetId: u.targetId,
      change: u.change,
      status: u.status,
      revision: u.revision,
      summary: u.summary,
      proposed: u.proposed ?? null,
      data: u.data ?? null,
      readAt: u.readAt,
      createdAt: u.createdAt,
    })),
  };
};

export { syncSetup, listOfficialUpdates };