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
const buildItem = (schedule, input) =>
  new ScheduleItem({
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

const refsOf = (item) => ({
  kind: item.kind,
  subjectKey: item.subjectKey,
  group: item.group,
  slotKey: item.slotKey,
});

// Steps 2 to 4 for one new, already validated item. If the log entry cannot be written the item is
// removed again, so the request can simply be sent again.
const persistItem = async ({ schedule, actor, item, note, affectedStudents }) => {
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
      note: note ?? '',
      // The number of students attached to the schedule: an upper bound until the impact preview
      // (undo, redo and preview step) narrows it by group and subject
      affectedStudents,
    });
  } catch (err) {
    await ScheduleItem.deleteOne({ _id: item._id }).catch(() => {});
    throw err;
  }
};

const createItem = async ({ user, scheduleId, input }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });

  const item = buildItem(schedule, input);
  // The model's own rules (times, subject, slot, one date) are refused before a revision is used
  await validateOrThrow(item);

  const values = refsOf(item);
  await checkRefs({ schedule, values, changed: changedRefs({}, values) });

  await persistItem({
    schedule,
    actor,
    item,
    note: input.note,
    affectedStudents: await countAttachedStudents(schedule._id),
  });

  return {
    item: await shapeOne(schedule._id, item.toObject()),
    warnings: itemWarnings(item, schedule, LONG_RANGE_WARNING_DAYS),
  };
};

// ---------- Bulk create ----------

const errorsOf = (err) => (err.errors?.length ? err.errors : [err.message]);

const sameItemKey = (item) =>
  [item.kind, item.title.trim().toLowerCase(), dateText(item.startDate), dateText(item.endDate)].join('|');

// items (already cleaned by the validator): a list of the same shape createItem takes.
// All or nothing on validation: every item is checked first (model rules, subject, group, slot,
// repeats inside the list, repeats of items already in the schedule). If any fail, nothing is saved
// and every problem is returned with its position. Then the items are saved one by one, in order,
// each with its own revision and log entry, so the CR can undo or withdraw any one of them.
// note (optional) is written on the log entry of every item that has no note of its own.
const bulkCreateItems = async ({ user, scheduleId, items, note }) => {
  const { schedule, actor } = await loadEditableSchedule({ user, scheduleId });

  const errors = [];
  const built = [];
  const seenSlots = new Set();
  const seenItems = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const item = buildItem(schedule, items[index]);
    const problems = [];

    try {
      await validateOrThrow(item);
      const values = refsOf(item);
      await checkRefs({ schedule, values, changed: changedRefs({}, values) });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      problems.push(...errorsOf(err));
    }

    if (!problems.length) {
      // repeats inside this request
      if (isSlotKind(item.kind) && item.slotKey) {
        const slotId = `${item.subjectKey ?? ''}|${item.slotKey}|${item.kind}`;
        if (seenSlots.has(slotId)) problems.push('Another item in this request uses the same subject and slot');
        seenSlots.add(slotId);
      }
      const itemId = sameItemKey(item);
      if (seenItems.has(itemId)) problems.push('This item appears twice in the request');
      seenItems.add(itemId);
    }

    problems.forEach((message) => errors.push(`items[${index}] (${items[index].title}): ${message}`));
    built.push(item);
  }

  // repeats of items already in the schedule (one query), so sending the same list twice does not
  // create every holiday twice
  if (!errors.length) {
    const existing = await ScheduleItem.find({
      scheduleId: schedule._id,
      status: ITEM_STATUS.ACTIVE,
      $or: built.map((i) => ({ kind: i.kind, title: i.title, startDate: i.startDate, endDate: i.endDate })),
    })
      .select('kind title startDate endDate')
      .lean();
    const existingKeys = new Set(existing.map(sameItemKey));
    built.forEach((item, index) => {
      if (existingKeys.has(sameItemKey(item))) {
        errors.push(`items[${index}] (${item.title}): The schedule already has this item`);
      }
    });
  }

  if (errors.length) {
    throw new ApiError(400, `Nothing was saved. ${errors.length} problem(s) found in the list.`, errors);
  }

  const affectedStudents = await countAttachedStudents(schedule._id);
  const saved = [];
  try {
    for (const item of built) {
      await persistItem({ schedule, actor, item, note: item.note ?? note, affectedStudents });
      saved.push(item);
    }
  } catch (err) {
    // Items saved before the error stay, and each is fully logged, so none is left half-done
    throw new ApiError(err.statusCode ?? 500, err.message || 'Could not save every item', [
      ...(err.errors ?? []),
      `${saved.length} of ${built.length} items were saved before the error. Reload the list, then send only the missing ones.`,
    ]);
  }

  const names = await loadSubjectNames(schedule._id, saved);
  return {
    items: saved.map((item) => shapeItem(item.toObject(), names)),
    count: saved.length,
    warnings: saved.flatMap((item) =>
      itemWarnings(item, schedule, LONG_RANGE_WARNING_DAYS).map((w) => `${item.title}: ${w}`)
    ),
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
    values: refsOf(item),
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

export { listItems, getItem, createItem, bulkCreateItems, updateItem, withdrawItem, restoreItem, checkRefs };