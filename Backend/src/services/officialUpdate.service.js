import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import SetupOfficialUpdate, { UPDATE_STATUS } from '../models/Official/setupOfficialUpdate.model.js';
import Setup from '../models/TimeTable/setup.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import ApiError from '../utils/ApiError.js';
import { validateOrThrow } from '../utils/saveOrThrow.js';
import { formatDateOnly } from '../utils/date.util.js';
import { clampRuleRange } from '../utils/officialJoinRules.js';
import { describeOfficialRule } from '../utils/officialSyncRules.js';
import {
  ACCEPT_RULE_CHANGE,
  acceptKind,
  acceptBlockedReason,
  dismissBlockedReason,
  dismissDetachesRule,
  patchFromOfficial,
  markBefore,
  hasOptOut,
} from '../utils/officialUpdateRules.js';
import {
  findOverlaps,
  syncRuleOccurrences,
  getRuleDeleteImpact,
  deleteRuleWithChildren,
} from './recurringRule.service.js';
import { syncSetup } from './officialSync.service.js';
import { ITEM_STATUS, ORIGIN } from '../utils/constants.js';

// What a student can do with the Official updates list, their hidden official items and the link
// between their own classes/subjects and the official ones. Everything here works on the caller's
// own setup (loadSetup) and every lookup is { _id, setupId }, so another student's records are
// never reachable.
//
// Accepting a changed class follows the same path as the student editing a class by hand
// (recurringRule.controller.updateRule): validate, check overlaps, bump ruleVersion, bring the
// classes from today onward in line, and save the rule LAST. A failure leaves the rule unchanged and
// the same request can be sent again.

// These lists mirror the ones in recurringRule.controller.js
const VERSION_FIELDS = [
  'subjectId', 'weekday', 'startTime', 'endTime', 'attendanceUnits',
  'effectiveStartDate', 'effectiveEndDate', 'classType', 'group',
];
const SCHEDULE_FIELDS = [...VERSION_FIELDS, 'isActive'];
const OVERLAP_FIELDS = [
  'subjectId', 'weekday', 'startTime', 'endTime', 'effectiveStartDate', 'effectiveEndDate', 'group', 'isActive',
];

const todayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const assertOpen = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};
const assertJoined = (setup) => {
  if (!setup.officialScheduleId) throw new ApiError(409, 'This setup is not following an official schedule');
};

const loadUpdate = async (setup, updateId) => {
  const update = await SetupOfficialUpdate.findOne({ _id: updateId, setupId: setup._id });
  if (!update) throw new ApiError(404, 'Update not found');
  return update;
};

const shapeUpdate = (u) => ({
  id: u._id,
  targetKind: u.targetKind,
  targetId: u.targetId,
  change: u.change,
  status: u.status,
  revision: u.revision,
  summary: u.summary,
  readAt: u.readAt,
});

const closeUpdate = (update, status) =>
  SetupOfficialUpdate.updateOne(
    { _id: update._id, setupId: update.setupId, status: UPDATE_STATUS.PENDING },
    { $set: { status, readAt: update.readAt ?? new Date() } }
  );

// ---------- Read / unread ----------

const markRead = async ({ setup, updateId }) => {
  const update = await loadUpdate(setup, updateId);
  if (!update.readAt) {
    update.readAt = new Date();
    await update.save();
  }
  return { update: shapeUpdate(update) };
};

const markAllRead = async ({ setup }) => {
  const result = await SetupOfficialUpdate.updateMany({ setupId: setup._id, readAt: null }, { $set: { readAt: new Date() } });
  return { marked: result.modifiedCount };
};

// ---------- Accept ----------

// The CR's class, current version. A newer change than the one the update line describes is used, so
// accepting never applies something that has already been replaced.
const loadOfficialRule = async (setup, ruleId) => {
  const official = await ScheduleRule.findOne({ _id: ruleId, scheduleId: setup.officialScheduleId }).lean();
  if (!official) throw new ApiError(404, 'The official class no longer exists');
  return official;
};

const applyRuleChange = async ({ setup, userId, update, confirmOverlap }) => {
  const rule = await RecurringRule.findOne({ setupId: setup._id, officialRuleId: update.targetId });
  if (!rule) throw new ApiError(409, 'You no longer have this class, so there is nothing to change');
  if (rule.detachedFromOfficial) {
    throw new ApiError(409, 'You detached this class from the official schedule. Re-attach it first.');
  }

  const official = await loadOfficialRule(setup, update.targetId);
  if (official.status === ITEM_STATUS.WITHDRAWN) {
    throw new ApiError(409, 'Your CR has removed this class since. Refresh your updates.');
  }
  const range = clampRuleRange(official, setup.startDate, setup.endDate);
  if (!range) throw new ApiError(409, 'The official class falls outside your setup dates');

  const previous = rule.toObject();
  rule.set(patchFromOfficial(official, range));
  rule.officialRevisionSeen = official.revision;
  await validateOrThrow(rule);

  const warnings = [];
  if (rule.isActive && OVERLAP_FIELDS.some((f) => rule.isModified(f))) {
    const subject = await Subject.findOne({ _id: rule.subjectId, setupId: setup._id }).select('name').lean();
    const overlaps = await findOverlaps({
      setupId: setup._id,
      candidate: rule,
      subjectName: subject?.name ?? 'Class',
      excludeRuleId: rule._id,
    });
    if (overlaps.length && confirmOverlap !== true) {
      throw new ApiError(409, 'This change makes the class overlap with another one', [
        ...overlaps,
        'Send confirmOverlap: true to accept it anyway.',
      ]);
    }
    warnings.push(...overlaps);
  }

  if (VERSION_FIELDS.some((f) => rule.isModified(f))) rule.ruleVersion = previous.ruleVersion + 1;

  let sync = null;
  if (SCHEDULE_FIELDS.some((f) => rule.isModified(f))) {
    const today = todayUtc();
    const boundary = today > previous.effectiveStartDate ? today : previous.effectiveStartDate;
    sync = await syncRuleOccurrences({ setupId: setup._id, userId, desired: rule.toObject(), previous, boundary });
    if (boundary > previous.effectiveStartDate) warnings.push(`Classes before ${formatDateOnly(boundary)} were not changed.`);
    if (sync.keptWithData) {
      warnings.push(`${sync.keptWithData} class(es) that no longer match already have attendance recorded and were kept. Review them.`);
    }
  }

  // The rule is saved last, so a failure above leaves it unchanged and this can be sent again
  await rule.save();
  return { sync, warnings };
};

const applyRuleRemoval = async ({ setup, userId, update, confirm }) => {
  const official = await loadOfficialRule(setup, update.targetId);
  if (official.status !== ITEM_STATUS.WITHDRAWN) {
    throw new ApiError(409, 'Your CR has restored this class since. Refresh your updates.');
  }
  const rule = await RecurringRule.findOne({ setupId: setup._id, officialRuleId: update.targetId });
  if (!rule) return { removed: false, summary: null }; // already gone: the line is simply closed

  const impact = await getRuleDeleteImpact(rule, userId);
  // Recorded attendance is permanent once deleted, so it needs an explicit yes
  if (impact.recordedClasses > 0 && confirm !== true) {
    throw new ApiError(409, 'Removing this weekly class also deletes recorded attendance', [
      `${impact.classes} class(es) will be deleted, ${impact.recordedClasses} with attendance or marks.`,
      'Send confirm: true to remove it. To keep it, dismiss this update instead.',
    ]);
  }
  const summary = await deleteRuleWithChildren({ setup, rule, userId });
  return { removed: true, summary };
};

// input: { confirm?, confirmOverlap? }
const acceptUpdate = async ({ setup, userId, updateId, confirm = false, confirmOverlap = false }) => {
  assertOpen(setup);
  assertJoined(setup);
  const update = await loadUpdate(setup, updateId);
  const reason = acceptBlockedReason(update);
  if (reason) throw new ApiError(409, reason);

  const result =
    acceptKind(update) === ACCEPT_RULE_CHANGE
      ? await applyRuleChange({ setup, userId, update, confirmOverlap })
      : await applyRuleRemoval({ setup, userId, update, confirm });

  await closeUpdate(update, UPDATE_STATUS.APPLIED);
  return { accepted: true, kind: acceptKind(update), ...result };
};

// ---------- Dismiss ----------

// "Keep mine". For a weekly class this also detaches it, so the CR's later changes stop being offered.
// Re-attach brings the offers back.
const dismissUpdate = async ({ setup, updateId }) => {
  assertOpen(setup);
  const update = await loadUpdate(setup, updateId);
  const reason = dismissBlockedReason(update);
  if (reason) throw new ApiError(409, reason);

  let detached = false;
  if (dismissDetachesRule(update)) {
    const result = await RecurringRule.updateOne(
      { setupId: setup._id, officialRuleId: update.targetId, origin: ORIGIN.OFFICIAL },
      { $set: { detachedFromOfficial: true } }
    );
    detached = result.modifiedCount > 0;
  }
  await closeUpdate(update, UPDATE_STATUS.DISMISSED);
  return { dismissed: true, detached };
};

// ---------- Items the student hid ----------

const loadOfficialRecord = (setup, kind, id) => {
  const filter = { _id: id, scheduleId: setup.officialScheduleId };
  if (kind === 'subject') return ScheduleSubject.findOne(filter).lean();
  if (kind === 'rule') return ScheduleRule.findOne(filter).lean();
  return ScheduleItem.findOne(filter).lean();
};

// What the student hid, named so a list can show it
const listOptOuts = async ({ setup }) => {
  const entries = setup.officialOptOuts ?? [];
  if (!entries.length) return { optOuts: [] };

  const of = (kind) => entries.filter((e) => e.kind === kind).map((e) => e.id);
  const [subjects, rules, items] = await Promise.all([
    ScheduleSubject.find({ _id: { $in: of('subject') } }).select('name key').lean(),
    ScheduleRule.find({ _id: { $in: of('rule') } }).lean(),
    ScheduleItem.find({ _id: { $in: of('item') } }).select('title kind').lean(),
  ]);
  const subjectKeys = [...new Set(rules.map((r) => r.subjectKey))];
  const ruleSubjects = subjectKeys.length
    ? await ScheduleSubject.find({ scheduleId: setup.officialScheduleId, key: { $in: subjectKeys } }).select('key name').lean()
    : [];
  const nameByKey = new Map(ruleSubjects.map((s) => [s.key, s.name]));

  const label = new Map();
  for (const s of subjects) label.set(`subject:${s._id}`, s.name);
  for (const r of rules) label.set(`rule:${r._id}`, describeOfficialRule(r, nameByKey.get(r.subjectKey) ?? 'Class'));
  for (const i of items) label.set(`item:${i._id}`, `${i.kind.replace(/_/g, ' ')}: ${i.title}`);

  return {
    optOuts: entries.map((e) => ({ kind: e.kind, id: e.id, label: label.get(`${e.kind}:${e.id}`) ?? null })),
  };
};

// Lowers the sync mark so the record is read again, then syncs now so the student sees the result
const resyncFrom = async (setup, revision) => {
  await Setup.updateOne({ _id: setup._id }, { $min: { lastSyncedContentRevision: markBefore(revision) } });
  const fresh = await Setup.findById(setup._id);
  return syncSetup({ setup: fresh });
};

// Un-hides an official item. The next sync adds it back (a deleted class or event comes back).
const restoreOptOut = async ({ setup, kind, id }) => {
  assertOpen(setup);
  assertJoined(setup);
  if (!hasOptOut(setup.officialOptOuts, kind, id)) throw new ApiError(404, 'You have not hidden this item');

  await Setup.updateOne({ _id: setup._id }, { $pull: { officialOptOuts: { kind, id } } });
  const record = await loadOfficialRecord(setup, kind, id);
  // The CR's record may be gone: then there is nothing to bring back and the entry is just cleared
  const sync = record ? await resyncFrom(setup, record.revision) : null;
  return { restored: true, sync };
};

// ---------- Detach and re-attach ----------

// Detach: keep this class or subject exactly as it is; official changes to it stop arriving.
const detachRule = async ({ setup, ruleId }) => {
  assertOpen(setup);
  const rule = await RecurringRule.findOne({ _id: ruleId, setupId: setup._id, origin: ORIGIN.OFFICIAL });
  if (!rule) throw new ApiError(404, 'Official class not found');
  if (!rule.detachedFromOfficial) await RecurringRule.updateOne({ _id: rule._id }, { $set: { detachedFromOfficial: true } });
  return { detached: true };
};

// Re-attach: official changes are offered again. Where your class differs from the CR's, it shows up
// as a pending update to accept or dismiss; nothing is overwritten by itself.
const reattachRule = async ({ setup, ruleId }) => {
  assertOpen(setup);
  assertJoined(setup);
  const rule = await RecurringRule.findOne({ _id: ruleId, setupId: setup._id, origin: ORIGIN.OFFICIAL });
  if (!rule) throw new ApiError(404, 'Official class not found');
  const official = await loadOfficialRule(setup, rule.officialRuleId);

  await RecurringRule.updateOne({ _id: rule._id }, { $set: { detachedFromOfficial: false, officialRevisionSeen: 0 } });
  // A line the student dismissed is never recreated for the same revision, so clear it. Otherwise
  // the difference would not be offered again.
  await SetupOfficialUpdate.deleteMany({
    setupId: setup._id,
    targetKind: 'rule',
    targetId: official._id,
    status: UPDATE_STATUS.DISMISSED,
  });
  const sync = await resyncFrom(setup, official.revision);
  return { reattached: true, sync };
};

const detachSubject = async ({ setup, subjectId }) => {
  assertOpen(setup);
  const subject = await Subject.findOne({ _id: subjectId, setupId: setup._id, origin: ORIGIN.OFFICIAL }).select('_id officialDetached');
  if (!subject) throw new ApiError(404, 'Official subject not found');
  if (!subject.officialDetached) await Subject.updateOne({ _id: subject._id }, { $set: { officialDetached: true } });
  return { detached: true };
};

// Unlike a class, a subject follows the CR's name and code on its own. Re-attaching therefore renames
// it right away, so it needs confirm: true.
const reattachSubject = async ({ setup, subjectId, confirm = false }) => {
  assertOpen(setup);
  assertJoined(setup);
  const subject = await Subject.findOne({ _id: subjectId, setupId: setup._id, origin: ORIGIN.OFFICIAL }).select('officialKey name');
  if (!subject) throw new ApiError(404, 'Official subject not found');
  const official = await ScheduleSubject.findOne({ scheduleId: setup.officialScheduleId, key: subject.officialKey }).lean();
  if (!official) throw new ApiError(404, 'The official subject no longer exists');

  if (confirm !== true && official.name !== subject.name) {
    throw new ApiError(409, 'Re-attaching renames this subject to the official name', [
      `"${subject.name}" will become "${official.name}".`,
      'Send confirm: true to continue.',
    ]);
  }
  await Subject.updateOne({ _id: subject._id }, { $set: { officialDetached: false, officialRevisionSeen: 0 } });
  const sync = await resyncFrom(setup, official.revision);
  return { reattached: true, sync };
};

export {
  markRead,
  markAllRead,
  acceptUpdate,
  dismissUpdate,
  listOptOuts,
  restoreOptOut,
  detachRule,
  reattachRule,
  detachSubject,
  reattachSubject,
};