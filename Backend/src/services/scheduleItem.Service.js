import ScheduleItem from '../models/Official/scheduleItem.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import ApiError from '../utils/ApiError.js';
import saveOrThrow, { validateOrThrow } from '../utils/saveOrThrow.js';
import { canonicalSnapshot } from '../utils/scheduleActions.js';
import {
  CLEARABLE_FIELDS,
  ALL_REFS_CHANGED,
  dateText,
  isSlotKind,
  describeItem,
  itemWarnings,
  changedRefs,
  slotConflictMessage,
} from '../utils/scheduleItemRules.js';
import { allocateRevision, recordAction } from './scheduleRevision.service.js';
import { loadEditableSchedule, countAttachedStudents } from './officialSchedule.service.js';
import { ACTION_OP, ACTION_TARGET, ITEM_STATUS, LONG_RANGE_WARNING_DAYS } from '../utils/constants.js';

// Items are the CR's exams, quizzes, holidays, breaks, mass bunks and class cancels. Every write
// follows the same order, so a failure can be retried:
//   1. validate the item and its references (nothing is written yet)
//   2. take the next revision (one atomic increment, see scheduleRevision.service.js)
//   3. save the item, stamped with that revision
//   4. write the action log entry
// Items are withdrawn and restored, never deleted, so undo and sync can still see them.
// Every lookup is { _id, scheduleId }: permission is checked on the schedule in the URL, so an item
// of another schedule must never be reachable through it.

const SLOT_TAKEN = 'Another active item already uses this subject and slot';

// ---------- Shaping ----------

const shapeItem = (item, subjectNames = new Map()) => ({
  id: item._id,
  kind: item.kind,
  title: item.title,
  startDate: dateText(item.startDate),
  endDate: dateText(item.endDate),
  startTime: item.startTime ?? null,
  endTime: item.endTime ?? null,
  subjectKey: item.subjectKey ?? null,
  subjectName: item.subjectKey ? subjectNames.get(item.subjectKey) ?? null : null,
  slotKey: item.slotKey ?? null,
  classType: item.classType ?? null,
  group: item.group ?? null,
  note: item.note ?? null,
  affectsClasses: item.affectsClasses,
  status: item.status,
  revision: item.revision,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

// key -> name for the subjects the items refer to, in one query
const loadSubjectNames = async (scheduleId, items) => {
  const keys = [...new Set(items.map((i) => i.subjectKey).filter(Boolean))];
  if (!keys.length) return new Map();
  const subjects = await ScheduleSubject.find({ scheduleId, key: { $in: keys } }).select('key name').lean();
  return new Map(subjects.map((s) => [s.key, s.name]));
};

const shapeOne = async (scheduleId, item) => shapeItem(item, await loadSubjectNames(scheduleId, [item]));

const targetOf = (item) => ({ kind: ACTION_TARGET.ITEM, id: item._id });

const loadItem = async (scheduleId, itemId) => {
  const item = await ScheduleItem.findOne({ _id: itemId, scheduleId });
  if (!item) throw new ApiError(404, 'Item not found');
  return item;
};

// ---------- References ----------

const assertSubjectActive = async (scheduleId, subjectKey) => {
  const subject = await ScheduleSubject.findOne({ scheduleId, key: subjectKey, status: ITEM_STATUS.ACTIVE })
    .select('name')
    .lean();
  if (!subject) {
    throw new ApiError(400, 'That subject is not an active subject of this schedule', [
      'Add the subject first, or restore it if it was withdrawn.',
    ]);
  }
  return subject.name;
};

const assertGroupExists = (schedule, group) => {
  if (schedule.groups.some((g) => g.key === group)) return;
  const available = schedule.groups.map((g) => g.key).join(', ') || 'none yet';
  throw new ApiError(400, `Group "${group}" is not in this schedule`, [
    `Groups in this schedule: ${available}`,
    'Add the group to the schedule first.',
  ]);
};

// One quiz or exam per subject and slot. The model's unique index covers an item with a subject
// (and catches two requests sent at the same moment). This check also covers an exam that applies to
// every subject (no subjectKey), which an index cannot test for.
const assertSlotFree = async ({ scheduleId, kind, subjectKey, slotKey, excludeId }) => {
  if (!isSlotKind(kind) || !slotKey) return;

  const filter = { scheduleId, status: ITEM_STATUS.ACTIVE, slotKey, subjectKey: subjectKey ?? null };
  if (excludeId) filter._id = { $ne: excludeId };
  const clash = await ScheduleItem.findOne(filter).select('title').lean();
  if (!clash) return;

  let subjectName = null;
  if (subjectKey) subjectName = (await loadSubjectNames(scheduleId, [{ subjectKey }])).get(subjectKey) ?? subjectKey;
  throw new ApiError(409, slotConflictMessage({ kind, slotKey, subjectName }), [
    `Existing item: "${clash.title}" (${clash._id})`,
    'Withdraw or edit it first.',
  ]);
};

// Checks only the references that changed. values: { kind, subjectKey, group, slotKey }
const checkRefs = async ({ schedule, values, changed, excludeId }) => {
  if (values.subjectKey && changed.subject) await assertSubjectActive(schedule._id, values.subjectKey);
  if (values.group && changed.group) assertGroupExists(schedule, values.group);
  if (changed.slot) {
    await assertSlotFree({
      scheduleId: schedule._id,
      kind: values.kind,
      subjectKey: values.subjectKey,
      slotKey: values.slotKey,
      excludeId,
    });
  }
};

// ---------- Read ----------

// query (already cleaned): { kind?, status?, subjectKey?, slotKey?, from?, to? }.
// Items that overlap [from, to]. Active items only, unless status is given.
const listItems = async ({ user, scheduleId, query = {} }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });

  const filter = { scheduleId: schedule._id, status: query.status ?? ITEM_STATUS.ACTIVE };
  if (query.kind) filter.kind = query.kind;
  if (query.subjectKey) filter.subjectKey = query.subjectKey;
  if (query.slotKey) filter.slotKey = query.slotKey;
  if (query.from) filter.endDate = { $gte: query.from };
  if (query.to) filter.startDate = { $lte: query.to };

  const items = await ScheduleItem.find(filter).sort({ startDate: 1, _id: 1 }).limit(500).lean();
  const names = await loadSubjectNames(schedule._id, items);
  return items.map((item) => shapeItem(item, names));
};

const getItem = async ({ user, scheduleId, itemId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const item = await loadItem(schedule._id, itemId);
  return { item: await shapeOne(schedule._id, item.toObject()) };
};

// ---------- Create ----------

// input (already cleaned by the validator):
//   { kind, title, startDate, endDate, startTime?, endTime?, subjectKey?, slotKey?, classType?, group?, note? }
const createItem = async ({ user, scheduleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });

  const item = new ScheduleItem({
    scheduleId: schedule._id,
    kind: input.kind,
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    subjectKey: input.subjectKey ?? null,
    slotKey: input.slotKey ?? null,
    classType: input.classType ?? null,
    group: input.group ?? null,
    note: input.note,
    status: ITEM_STATUS.ACTIVE,
  });
  // The model's own rules (times, subject, slot, one date) are refused before a revision is used
  await validateOrThrow(item);

  const values = { kind: item.kind, subjectKey: item.subjectKey, group: item.group, slotKey: item.slotKey };
  await checkRefs({ schedule, values, changed: changedRefs({}, values) });

  const seq = await allocateRevision(schedule._id);
  item.revision = seq;
  await saveOrThrow(item, { duplicate: SLOT_TAKEN });

  try {
    await recordAction({
      scheduleId: schedule._id,
      seq,
      target: targetOf(item),
      op: ACTION_OP.CREATE,
      before: null,
      after: canonicalSnapshot('item', item),
      actor,
      summary: `Added ${describeItem(item)}`,
      note: input.note ?? '',
      // The number of students attached to the schedule: an upper bound until the impact preview
      // (undo, redo and preview step) narrows it by group and subject
      affectedStudents: await countAttachedStudents(schedule._id),
    });
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    await ScheduleItem.deleteOne({ _id: item._id }).catch(() => {});
    throw err;
  }

  return {
    item: await shapeOne(schedule._id, item.toObject()),
    warnings: itemWarnings(item, schedule, LONG_RANGE_WARNING_DAYS),
  };
};

// ---------- Update ----------

// input (already cleaned): any of title, startDate, endDate, startTime, endTime, subjectKey, slotKey,
// classType, group, note. null removes a field that may be empty. The kind cannot change.
const updateItem = async ({ user, scheduleId, itemId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const item = await loadItem(schedule._id, itemId);
  if (item.status === ITEM_STATUS.WITHDRAWN) {
    throw new ApiError(409, 'This item is withdrawn. Restore it before editing it.');
  }

  const before = canonicalSnapshot('item', item);
  const current = { subjectKey: item.subjectKey, group: item.group, slotKey: item.slotKey };

  for (const [field, value] of Object.entries(input)) {
    if (value === null) {
      if (CLEARABLE_FIELDS.includes(field)) item.set(field, field === 'note' ? undefined : null);
    } else {
      item.set(field, value);
    }
  }

  if (!item.isModified()) {
    return { item: await shapeOne(schedule._id, item.toObject()), warnings: [], changed: false };
  }

  await validateOrThrow(item);

  const next = { subjectKey: item.subjectKey, group: item.group, slotKey: item.slotKey };
  await checkRefs({
    schedule,
    values: { kind: item.kind, ...next },
    changed: changedRefs(current, next),
    excludeId: item._id,
  });

  const seq = await allocateRevision(schedule._id);
  item.revision = seq;
  await saveOrThrow(item, { duplicate: SLOT_TAKEN });

  await recordAction({
    scheduleId: schedule._id,
    seq,
    target: targetOf(item),
    op: ACTION_OP.UPDATE,
    before,
    after: canonicalSnapshot('item', item),
    actor,
    summary: `Changed ${describeItem(item)}`,
    note: input.note ?? '',
    affectedStudents: await countAttachedStudents(schedule._id),
  });

  return {
    item: await shapeOne(schedule._id, item.toObject()),
    warnings: itemWarnings(item, schedule, LONG_RANGE_WARNING_DAYS),
    changed: true,
  };
};

// ---------- Withdraw and restore ----------

// Students' next sync takes the item back (a withdrawn holiday gives its classes back). The slot of
// a withdrawn quiz or exam is free again.
const withdrawItem = async ({ user, scheduleId, itemId, note }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const item = await loadItem(schedule._id, itemId);
  if (item.status !== ITEM_STATUS.ACTIVE) throw new ApiError(409, 'This item is already withdrawn');

  const before = canonicalSnapshot('item', item);
  const seq = await allocateRevision(schedule._id);
  item.status = ITEM_STATUS.WITHDRAWN;
  item.revision = seq;
  await saveOrThrow(item);

  await recordAction({
    scheduleId: schedule._id,
    seq,
    target: targetOf(item),
    op: ACTION_OP.WITHDRAW,
    before,
    after: canonicalSnapshot('item', item),
    actor,
    summary: `Withdrew ${describeItem(item)}`,
    note: note ?? '',
    affectedStudents: await countAttachedStudents(schedule._id),
  });
  return { item: await shapeOne(schedule._id, item.toObject()) };
};

// The subject may have been withdrawn, a group removed, or the slot taken by another item since, so
// every reference is checked again.
const restoreItem = async ({ user, scheduleId, itemId, note }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });
  const item = await loadItem(schedule._id, itemId);
  if (item.status !== ITEM_STATUS.WITHDRAWN) throw new ApiError(409, 'This item is not withdrawn');

  await checkRefs({
    schedule,
    values: { kind: item.kind, subjectKey: item.subjectKey, group: item.group, slotKey: item.slotKey },
    changed: ALL_REFS_CHANGED,
    excludeId: item._id,
  });

  const before = canonicalSnapshot('item', item);
  const seq = await allocateRevision(schedule._id);
  item.status = ITEM_STATUS.ACTIVE;
  item.revision = seq;
  await saveOrThrow(item, { duplicate: SLOT_TAKEN });

  await recordAction({
    scheduleId: schedule._id,
    seq,
    target: targetOf(item),
    op: ACTION_OP.UPDATE,
    before,
    after: canonicalSnapshot('item', item),
    actor,
    summary: `Restored ${describeItem(item)}`,
    note: note ?? '',
    affectedStudents: await countAttachedStudents(schedule._id),
  });
  return {
    item: await shapeOne(schedule._id, item.toObject()),
    warnings: itemWarnings(item, schedule, LONG_RANGE_WARNING_DAYS),
  };
};

export { listItems, getItem, createItem, updateItem, withdrawItem, restoreItem, checkRefs };