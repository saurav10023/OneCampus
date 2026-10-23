import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import Setup from '../models/TimeTable/setup.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import { ORIGIN, OPT_OUT_KIND } from '../utils/constants.js';
import { updateEvent, deleteEvent } from './calendarEvent.service.js';

// What a student may change on an official event. type and affectsClasses come from the
// official item, so they are locked. Changing dates or times stops auto-follow (lifecycle §4.5).
const EDITABLE_OFFICIAL_FIELDS = ['title', 'startDate', 'endDate', 'startTime', 'endTime', 'note'];
const SCHEDULE_FIELDS = ['startDate', 'endDate', 'startTime', 'endTime'];

const sameValue = (a, b) =>
  a instanceof Date || b instanceof Date
    ? new Date(a).getTime() === new Date(b).getTime()
    : (a ?? null) === (b ?? null);

// An official event that cancels classes can only be changed by the CR, so students cannot
// unlock their own classes by editing or hiding it
const assertStudentMayChange = (event) => {
  if (event.affectsClasses) {
    throw new ApiError(
      403,
      'This official event cancels classes, so only your CR can change it. Ask them to correct it.'
    );
  }
};
// $addToSet makes this idempotent, so a retried delete never duplicates an entry.
// updateOne is used on purpose: no other part of the setup is rewritten.
const addOptOuts = async (setupId, entries) => {
  if (!entries.length) return 0;
  await Setup.updateOne({ _id: setupId }, { $addToSet: { officialOptOuts: { $each: entries } } });
  return entries.length;
};

// For the sync service: skip anything in this set.   if (optOuts.has(optOutKey('rule', id))) continue;
const optOutKey = (kind, id) => `${kind}:${id}`;
const getOptOutSet = (setup) =>
  new Set((setup.officialOptOuts ?? []).map((o) => optOutKey(o.kind, o.id)));

// ---------- Events ----------

// Official events are the student's own copy, so they may be edited (v2). Only the allowed
// fields reach the normal update. Auto-follow is turned off only when the schedule changed.
const editOfficialEvent = async ({ setup, userId, event, input }) => {
  assertStudentMayChange(event);
  if (input.type !== undefined && input.type !== event.type) {
    throw new ApiError(400, 'The type of an official event cannot be changed');
  }
  if (input.affectsClasses !== undefined && input.affectsClasses !== event.affectsClasses) {
    throw new ApiError(400, 'An official event\'s effect on classes cannot be changed');
  }

  const picked = {};
  for (const field of EDITABLE_OFFICIAL_FIELDS) {
    if (input[field] !== undefined) picked[field] = input[field];
  }
  if (!Object.keys(picked).length) {
    throw new ApiError(400, `Nothing to update. You can change: ${EDITABLE_OFFICIAL_FIELDS.join(', ')}`);
  }

  // Captured before updateEvent, which may change the event object
  const detach =
    event.followOfficial &&
    SCHEDULE_FIELDS.some((f) => picked[f] !== undefined && !sameValue(event[f], picked[f]));

  const result = await updateEvent({ setup, userId, event, input: picked });

  const warnings = [];
  if (detach) {
    await CalendarEvent.updateOne({ _id: event._id }, { $set: { followOfficial: false } });
    warnings.push('You changed the dates of an official event. It will no longer follow official updates.');
  }
  return { ...result, warnings };
};

// Deleting an official event hides it from future syncs and gives its classes back.
// The hide record goes first, so a retry after a crash still hides it.
const deleteOfficialEvent = async ({ setup, userId, event }) => {
  assertStudentMayChange(event);
  if (!event.officialRef?.id) throw new ApiError(500, 'Official event has no officialRef');
  await addOptOuts(setup._id, [{ kind: OPT_OUT_KIND.ITEM, id: event.officialRef.id }]);
  const result = await deleteEvent({ setup, userId, event });
  return { ...result, hiddenFromOfficial: true };
};

// ---------- Subjects and rules ----------

// Without these, deleting an official rule deletes its officialRuleId with it, and the unique
// index that stops the sync from re-adding it disappears. The hide record is what stops that.
const hideOfficialRule = async (setup, rule) => {
  if (rule.origin !== ORIGIN.OFFICIAL || !rule.officialRuleId) return 0;
  return addOptOuts(setup._id, [{ kind: OPT_OUT_KIND.RULE, id: rule.officialRuleId }]);
};

// Hides an official subject and every official class under it.
// Subject stores the schedule's string key; the hide record needs the ScheduleSubject _id, so it
// is looked up. mongoose.models is used so this file loads before ScheduleSubject exists.
// Once that model is built, import it directly and remove the guard.
const hideOfficialSubject = async (setup, subject) => {
  if (subject.origin !== ORIGIN.OFFICIAL) return { hidden: 0 };

  const entries = [];

  const ruleIds = await RecurringRule.distinct('officialRuleId', {
    setupId: setup._id,
    subjectId: subject._id,
    officialRuleId: { $ne: null },
  });
  for (const id of ruleIds) entries.push({ kind: OPT_OUT_KIND.RULE, id });

  const ScheduleSubject = mongoose.models.ScheduleSubject;
  if (ScheduleSubject && setup.officialScheduleId && subject.officialKey) {
    const scheduleSubject = await ScheduleSubject.findOne({
      scheduleId: setup.officialScheduleId,
      key: subject.officialKey,
    })
      .select('_id')
      .lean();
    if (scheduleSubject) entries.push({ kind: OPT_OUT_KIND.SUBJECT, id: scheduleSubject._id });
  }

  return { hidden: await addOptOuts(setup._id, entries) };
};

export {
  editOfficialEvent,
  deleteOfficialEvent,
  hideOfficialRule,
  hideOfficialSubject,
  getOptOutSet,
  optOutKey,
};