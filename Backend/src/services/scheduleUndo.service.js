import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ScheduleRule from '../models/Official/scheduleRule.model.js';
import ScheduleItem from '../models/Official/scheduleItem.model.js';
import ScheduleAction from '../models/Official/scheduleAction.model.js';
import ApiError from '../utils/ApiError.js';
import saveOrThrow, { validateOrThrow } from '../utils/saveOrThrow.js';
import { isCollegeAdmin } from '../utils/schedulePermissions.js';
import { canonicalSnapshot, snapshotMatches, statePatch, undoBlockedReason } from '../utils/scheduleActions.js';
import { ALL_REFS_CHANGED } from '../utils/scheduleItemRules.js';
import {
  undoability,
  targetState,
  makesActive,
  makesInactive,
  removedGroupKeys,
  rulesOverlap,
  describeReversal,
} from '../utils/scheduleUndoRules.js';
import { allocateRevision, recordAction } from './scheduleRevision.service.js';
import { loadActiveRoles } from './scheduleRole.service.js';
import { loadEditableSchedule, countAttachedStudents } from './officialSchedule.service.js';
import { checkRefs } from './scheduleItem.Service.js';
import { ACTION_OP, ACTION_TARGET, ITEM_STATUS, SCHEDULE_STATUS } from '../utils/constants.js';

// Undo, redo and admin revert. All three are one move: put a record back to what an earlier action
// started from, and log that as a NEW action (op "undo") that points at the old one. History is never
// edited; the only change to an old row is its `undoneBy` pointer.
//
// Every reversal follows the same order as every other publisher write, so a failure can be retried:
//   1. load the action and the record, and refuse if it cannot be reversed
//   2. check the references the record will have again (subject, group, slot, class overlap)
//   3. apply the old state and validate it (nothing is saved yet)
//   4. take the next revision, save the record stamped with it
//   5. write the log entry, then mark the old action as undone
// Every lookup is { _id, scheduleId }: permission is checked on the schedule in the URL, so an action or
// record of another schedule must never be reachable through it.

const MODELS = {
  [ACTION_TARGET.SUBJECT]: ScheduleSubject,
  [ACTION_TARGET.RULE]: ScheduleRule,
  [ACTION_TARGET.ITEM]: ScheduleItem,
};

const DUPLICATE = {
  [ACTION_TARGET.SUBJECT]: 'Another active subject now uses that name or code',
  [ACTION_TARGET.RULE]: 'Another class now uses that time',
  [ACTION_TARGET.ITEM]: 'Another active item now uses this subject and slot',
  [ACTION_TARGET.SCHEDULE]: 'Another live schedule already exists for this class',
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// ---------- Shaping ----------

const actorOf = (action) => {
  const user = action.actorId;
  // populated: a user document. Not populated: just an id.
  if (user && typeof user === 'object' && (user.fullName !== undefined || user.username !== undefined)) {
    return { id: user._id, name: user.fullName ?? user.username ?? null, role: action.actorRole };
  }
  return { id: user?._id ?? user ?? null, name: null, role: action.actorRole };
};

const shapeAction = (action, { withSnapshots = false } = {}) => ({
  id: action._id,
  seq: action.seq,
  target: { kind: action.target.kind, id: action.target.id },
  op: action.op,
  summary: action.summary,
  note: action.note || null,
  actor: actorOf(action),
  affectedStudents: action.affectedStudents ?? null,
  undoes: action.undoes ?? null,
  undoneBy: action.undoneBy ?? null,
  createdAt: action.createdAt,
  ...(withSnapshots ? { before: action.before ?? null, after: action.after ?? null } : {}),
});

const loadAction = async (scheduleId, actionId) => {
  const action = await ScheduleAction.findOne({ _id: actionId, scheduleId })
    .populate('actorId', 'fullName username')
    .lean();
  if (!action) throw new ApiError(404, 'Action not found');
  return action;
};

// The record an action changed. The schedule itself is the one document already loaded.
const loadCurrent = (schedule, action) => {
  if (action.target.kind === ACTION_TARGET.SCHEDULE) return schedule;
  const Model = MODELS[action.target.kind];
  if (!Model) return null;
  return Model.findOne({ _id: action.target.id, scheduleId: schedule._id });
};

// ---------- History ----------

// query (already cleaned): { kind?, targetId?, op?, before?, limit? }
// Newest first. `before` is a seq: pass the previous page's nextBefore to get the next page.
const listActions = async ({ user, scheduleId, query = {} }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });

  const filter = { scheduleId: schedule._id };
  if (query.kind) filter['target.kind'] = query.kind;
  if (query.targetId) filter['target.id'] = query.targetId;
  if (query.op) filter.op = query.op;
  if (query.before) filter.seq = { $lt: query.before };

  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await ScheduleAction.find(filter)
    .sort({ seq: -1 })
    .limit(limit)
    .populate('actorId', 'fullName username')
    .lean();

  return {
    actions: rows.map((row) => shapeAction(row)),
    count: rows.length,
    nextBefore: rows.length === limit ? rows[rows.length - 1].seq : null,
  };
};

// ---------- Can it be reversed? ----------

// A later change to the same record, named in the error so the CR knows what to undo first
const newerChangeDetails = async (action) => {
  const newer = await ScheduleAction.findOne({
    scheduleId: action.scheduleId,
    'target.kind': action.target.kind,
    'target.id': action.target.id,
    seq: { $gt: action.seq },
  })
    .sort({ seq: -1 })
    .select('seq summary')
    .lean();
  return newer ? [`Latest change to it: #${newer.seq} "${newer.summary}"`] : [];
};

// Cheap checks only (no reference checks). Returns { message, details } or null.
const blockedReason = async ({ mode, action, current }) => {
  const early = undoability(action, mode);
  if (early) return { message: early, details: [] };
  if (!current) return { message: 'The record no longer exists', details: [] };

  const kind = action.target.kind;
  // A revert ignores later changes. Undo and redo need the record exactly as the action left it.
  if (mode !== 'revert') {
    const reason = undoBlockedReason(kind, action, current);
    if (reason) return { message: reason, details: await newerChangeDetails(action) };
  }
  if (snapshotMatches(kind, current, targetState(action))) {
    return { message: 'The record is already in that state', details: [] };
  }
  return null;
};

const getAction = async ({ user, scheduleId, actionId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const action = await loadAction(schedule._id, actionId);
  const current = await loadCurrent(schedule, action);

  // Which button to show. Reference checks run when the button is pressed, so "allowed" here means
  // "not blocked so far".
  const mode = action.op === ACTION_OP.UNDO ? 'redo' : 'undo';
  const archivedBlock =
    schedule.status === SCHEDULE_STATUS.ARCHIVED && action.target.kind !== ACTION_TARGET.SCHEDULE
      ? { message: 'An archived schedule is read-only', details: [] }
      : null;
  const reason = archivedBlock ?? (await blockedReason({ mode, action, current }));

  return {
    action: shapeAction(action, { withSnapshots: true }),
    reverse: { mode, allowed: !reason, reason: reason?.message ?? null },
  };
};

// ---------- Reference checks for the state a record goes back to ----------

const assertSubjectActive = async (scheduleId, subjectKey) => {
  const subject = await ScheduleSubject.exists({ scheduleId, key: subjectKey, status: ITEM_STATUS.ACTIVE });
  if (!subject) {
    throw new ApiError(409, 'Its subject is no longer an active subject of this schedule', [
      'Restore the subject first, then try again.',
    ]);
  }
};

const assertGroupExists = (schedule, group) => {
  if (!group || schedule.groups.some((g) => g.key === group)) return;
  throw new ApiError(409, `Group "${group}" is no longer in this schedule`, [
    'Add the group back to the schedule first, then try again.',
  ]);
};

const assertGroupsNotInUse = async (scheduleId, removedKeys) => {
  if (!removedKeys.length) return;
  const filter = { scheduleId, status: ITEM_STATUS.ACTIVE, group: { $in: removedKeys } };
  const [rules, items] = await Promise.all([ScheduleRule.countDocuments(filter), ScheduleItem.countDocuments(filter)]);
  if (rules || items) {
    throw new ApiError(409, 'A group that is still used cannot be removed', [
      `Groups in use: ${removedKeys.join(', ')}`,
      `${rules} class(es) and ${items} item(s) still use them. Change or withdraw those first.`,
    ]);
  }
};

// `to` is the snapshot the record goes back to (null = withdrawn). Throws a 409 that says what is in the way.
const guardTarget = async ({ schedule, kind, current, to }) => {
  if (kind === ACTION_TARGET.SUBJECT) {
    // Taking a subject out of use must not strand its classes and items
    if (makesInactive(kind, to) && current.status === ITEM_STATUS.ACTIVE) {
      const filter = { scheduleId: schedule._id, subjectKey: current.key, status: ITEM_STATUS.ACTIVE };
      const [rules, items] = await Promise.all([ScheduleRule.countDocuments(filter), ScheduleItem.countDocuments(filter)]);
      if (rules || items) {
        throw new ApiError(409, 'This subject still has active classes or items', [
          `${rules} class(es) and ${items} item(s) use it. Withdraw those first.`,
        ]);
      }
    }
    return;
  }

  if (kind === ACTION_TARGET.RULE) {
    if (!makesActive(kind, to)) return;
    await assertSubjectActive(schedule._id, to.subjectKey);
    assertGroupExists(schedule, to.group);

    const others = await ScheduleRule.find({ scheduleId: schedule._id, status: ITEM_STATUS.ACTIVE, _id: { $ne: current._id } }).lean();
    const clash = others.map((rule) => ({ rule, snap: canonicalSnapshot('rule', rule) })).find(({ snap }) => rulesOverlap(to, snap));
    if (clash) {
      throw new ApiError(409, 'That class would overlap another active class', [
        `Overlaps rule ${clash.rule._id} (weekday ${clash.snap.weekday}, ${clash.snap.startTime}-${clash.snap.endTime}).`,
        'Withdraw or change that class first.',
      ]);
    }
    return;
  }

  if (kind === ACTION_TARGET.ITEM) {
    if (!makesActive(kind, to)) return;
    // The same checks as restoring an item: subject, group and the one-per-slot rule
    await checkRefs({
      schedule,
      values: { kind: to.kind, subjectKey: to.subjectKey, group: to.group, slotKey: to.slotKey },
      changed: ALL_REFS_CHANGED,
      excludeId: current._id,
    });
    return;
  }

  // The schedule itself: status and groups
  if (current.status === SCHEDULE_STATUS.PUBLISHED && to.status === SCHEDULE_STATUS.DRAFT) {
    const students = await countAttachedStudents(schedule._id);
    if (students > 0) {
      throw new ApiError(409, 'Students have already joined this schedule, so it cannot go back to a draft', [
        `${students} student(s) are attached. Archive it instead.`,
      ]);
    }
  }
  await assertGroupsNotInUse(schedule._id, removedGroupKeys(current.groups, to.groups));
};

// ---------- The reversal ----------

// mode: 'undo' | 'redo' | 'revert'
const reverse = async ({ user, scheduleId, actionId, mode, note }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });

  if (mode === 'revert') {
    const roles = await loadActiveRoles(user._id);
    if (!isCollegeAdmin(roles, schedule.collegeKey)) {
      throw new ApiError(403, 'Only a college admin can revert an action');
    }
  }

  const action = await loadAction(schedule._id, actionId);
  const kind = action.target.kind;

  // An archived schedule is read-only. The one exception is undoing the archive itself, which the
  // snapshot check below allows only when the schedule is exactly as that action left it.
  if (schedule.status === SCHEDULE_STATUS.ARCHIVED && kind !== ACTION_TARGET.SCHEDULE) {
    throw new ApiError(409, 'An archived schedule is read-only');
  }

  const current = await loadCurrent(schedule, action);
  const blocked = await blockedReason({ mode, action, current });
  if (blocked) throw new ApiError(409, blocked.message, blocked.details);

  const to = targetState(action);
  await guardTarget({ schedule, kind, current, to });

  // Apply and validate before a revision is used, so a refusal wastes nothing
  const before = canonicalSnapshot(kind, current);
  const previous = { patch: statePatch(kind, before), revision: current.revision };
  current.set(statePatch(kind, to));
  await validateOrThrow(current);

  const seq = await allocateRevision(schedule._id);
  if (kind !== ACTION_TARGET.SCHEDULE) current.revision = seq;
  await saveOrThrow(current, { duplicate: DUPLICATE[kind] });

  let entry;
  try {
    entry = await recordAction({
      scheduleId: schedule._id,
      seq,
      target: { kind, id: current._id },
      op: ACTION_OP.UNDO,
      before,
      after: canonicalSnapshot(kind, current),
      actor,
      summary: describeReversal(action, mode),
      note: note ?? '',
      affectedStudents: await countAttachedStudents(schedule._id),
      undoes: action._id,
    });
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    try {
      current.set(previous.patch);
      if (kind !== ACTION_TARGET.SCHEDULE) current.revision = previous.revision;
      await current.save();
    } catch {
      // best effort: the log gap is harmless, the next sync re-reads the record
    }
    throw err;
  }

  // Two requests sent at the same moment could both pass the checks above. Only one wins this update;
  // the other finds the record already changed on its next attempt.
  await ScheduleAction.updateOne({ _id: action._id, undoneBy: null }, { $set: { undoneBy: entry._id } });

  return {
    action: shapeAction(entry.toObject()),
    revision: seq,
    target: { kind, id: current._id },
  };
};

const undoAction = ({ user, scheduleId, actionId, note }) => reverse({ user, scheduleId, actionId, mode: 'undo', note });
const redoAction = ({ user, scheduleId, actionId, note }) => reverse({ user, scheduleId, actionId, mode: 'redo', note });
const revertAction = ({ user, scheduleId, actionId, note }) => reverse({ user, scheduleId, actionId, mode: 'revert', note });

export { listActions, getAction, undoAction, redoAction, revertAction };