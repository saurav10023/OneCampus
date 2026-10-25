import Setup from '../models/TimeTable/setup.model.js';

import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import ExtraClassAdjustment from '../models/Attendance/extraClassAdjustment.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import SetupCopy from '../models/Sharing/setupCopy.model.js';
import SetupOfficialUpdate from '../models/Official/setupOfficialUpdate.model.js';
import { leaveSchedule } from './officialJoin.service.js';
import {
  ATTENDANCE_STATUS,
  CAUSE_TYPE,
  STATUS_REASON,
  DAY_MS,
} from '../utils/constants.js';
import { SCOPE_FIELDS } from '../utils/scopeKey.js';
import {
  generateOccurrences,
  getOccurrenceIdsInRange,
  reconcileRangeStatuses,
} from './occurrence.service.js';
import { applyCancellation } from './cancellation.service.js';
import { applyRatingDelta } from './sharing.service.js';
import { User } from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';

const dayBefore = (date) => new Date(date.getTime() - DAY_MS);
const dayAfter = (date) => new Date(date.getTime() + DAY_MS);

// After a range grows, classes that came back or were newly generated may fall on a confirmed
// event that cancels classes (a holiday, break or official exam). Cancel them through the shared
// service. Safe to run twice. Event overlaps are resolved the same way revertCause does:
// the earliest-starting event takes the class.
const applyEventCancellations = async ({ setupId, userId, from, to, occurrenceIds }) => {
  const summary = { events: 0, cancelled: 0 };
  if (!from || !to || from > to) return summary;
  // An empty id list means "these exact classes, and there are none"
  if (Array.isArray(occurrenceIds) && occurrenceIds.length === 0) return summary;

  const events = await CalendarEvent.find({
    setupId,
    confirmedAt: { $ne: null },
    affectsClasses: true,
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .sort({ startDate: 1, _id: 1 })
    .select('_id startDate endDate')
    .lean();

  for (const event of events) {
    const filter = {
      from: event.startDate > from ? event.startDate : from,
      to: event.endDate < to ? event.endDate : to,
    };
    if (Array.isArray(occurrenceIds)) filter.occurrenceIds = occurrenceIds;

    const result = await applyCancellation({
      setupId,
      userId,
      filter,
      cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id },
    });
    summary.events += 1;
    summary.cancelled += result.cancelled;
  }
  return summary;
};

// restoredIds and addedIds come from reconcileRangeStatuses. If it does not return them,
// the date range alone is used, which gives the same result because applyCancellation
// skips classes that are not_counted, student-cancelled or already held.
const idsFromReconcile = (result) =>
  result?.restoredIds || result?.addedIds
    ? [...(result.restoredIds ?? []), ...(result.addedIds ?? [])]
    : undefined;

// Every step is idempotent, so a failed request can simply be retried
const applyStartDateChange = async (setup, newStart, oldStart, userId) => {
  const shrinking = newStart > oldStart;

  if (shrinking) {
    // Rules must not keep producing classes before the new start
    await RecurringRule.updateMany(
      { setupId: setup._id, effectiveStartDate: { $lt: newStart } },
      { $set: { effectiveStartDate: newStart } }
    );
  } else {
    // Rules that began with the setup now begin with the new start
    await RecurringRule.updateMany(
      { setupId: setup._id, effectiveStartDate: oldStart },
      { $set: { effectiveStartDate: newStart } }
    );
    await generateOccurrences(setup._id, newStart, dayBefore(oldStart));
  }

  const from = shrinking ? oldStart : newStart;
  const to = dayBefore(shrinking ? newStart : oldStart);
  const occurrenceIds = await getOccurrenceIdsInRange(setup._id, from, to);

  const result = await reconcileRangeStatuses({
    occurrenceIds,
    userId,
    shrinking,
    reason: STATUS_REASON.START_DATE_CHANGE,
    newStatus: ATTENDANCE_STATUS.NOT_COUNTED,
  });

  if (shrinking) return result;

  // The range grew: the new and restored classes may land on a confirmed holiday
  const eventCancellation = await applyEventCancellations({
    setupId: setup._id,
    userId,
    from,
    to,
    occurrenceIds: idsFromReconcile(result),
  });
  return { ...result, eventCancellation };
};

const applyEndDateChange = async (setup, newEnd, oldEnd, userId) => {
  const shrinking = newEnd < oldEnd;

  if (shrinking) {
    await RecurringRule.updateMany(
      { setupId: setup._id, effectiveEndDate: { $gt: newEnd } },
      { $set: { effectiveEndDate: newEnd } }
    );
  } else {
    await RecurringRule.updateMany(
      { setupId: setup._id, effectiveEndDate: oldEnd },
      { $set: { effectiveEndDate: newEnd } }
    );
    await generateOccurrences(setup._id, dayAfter(oldEnd), newEnd);
  }

  const from = dayAfter(shrinking ? newEnd : oldEnd);
  const to = shrinking ? oldEnd : newEnd;
  const occurrenceIds = await getOccurrenceIdsInRange(setup._id, from, to);

  const result = await reconcileRangeStatuses({
    occurrenceIds,
    userId,
    shrinking,
    reason: STATUS_REASON.END_DATE_CHANGE,
    // Per the spec, classes added by extending the finish date start as absent
    newStatus: ATTENDANCE_STATUS.ABSENT,
  });

  if (shrinking) return result;

  // The range grew: the new and restored classes may land on a confirmed holiday
  const eventCancellation = await applyEventCancellations({
    setupId: setup._id,
    userId,
    from,
    to,
    occurrenceIds: idsFromReconcile(result),
  });
  return { ...result, eventCancellation };
};

// Updates a setup's name, scope, target or timezone through save(), so the pre-validate hook
// recomputes scopeKey. Never use updateOne or findByIdAndUpdate for these fields: they skip
// the hook and leave scopeKey stale. Dates are not handled here; they go through
// applyStartDateChange and applyEndDateChange.
// Anything not in UPDATABLE_FIELDS (status, ownerId, scopeKey, official*, sharing fields) is ignored.
// A duplicate-scope error (E11000 on { ownerId, scopeKey }) is mapped to 409 by the controller.
const UPDATABLE_FIELDS = ['name', ...SCOPE_FIELDS, 'targetPercentage', 'timezone'];

const pickUpdatableFields = (changes = {}) => {
  const picked = {};
  for (const field of UPDATABLE_FIELDS) {
    if (changes[field] !== undefined) picked[field] = changes[field];
  }
  return picked;
};

const isScopeChanging = (setup, picked) =>
  SCOPE_FIELDS.some(
    (field) => picked[field] !== undefined && String(picked[field]).trim() !== setup[field]
  );

// const updateSetupDetails = async (setup, changes = {}, { leaveOfficial = false } = {}) => {
//   const picked = pickUpdatableFields(changes);
//   if (!Object.keys(picked).length) return setup;

//   if (setup.officialScheduleId && isScopeChanging(setup, picked)) {
//     if (!leaveOfficial) {
//       throw new ApiError(
//         409,
//         'This setup follows an official schedule. Send leaveOfficial: true to change its scope.'
//       );
//     }
//     // TODO (lifecycle Section 4): call officialJoin.service leave() here, then continue.
//     // Not reachable before then, because nothing can join a schedule yet.
//     throw new ApiError(501, 'Leaving an official schedule is not built yet');
//   }

//   setup.set(picked);
//   await setup.save();
//   return setup;
// };

// What deleting would destroy, so the UI can show a meaningful confirmation

const updateSetupDetails = async (setup, changes = {}, { leaveOfficial = false } = {}) => {
  const picked = pickUpdatableFields(changes);
  if (!Object.keys(picked).length) return setup;

  if (setup.officialScheduleId && isScopeChanging(setup, picked)) {
    if (!leaveOfficial) {
      throw new ApiError(
        409,
        'This setup follows an official schedule. Send leaveOfficial: true to change its scope.'
      );
    }
    // Clears the official link and keeps all the content, then the scope change goes ahead
    await leaveSchedule({ setup });
  }

  setup.set(picked);
  await setup.save();
  return setup;
};

const getDeleteImpact = async (setup, userId) => {
  const occurrenceIds = await Occurrence.distinct('_id', { setupId: setup._id });

  const [
    subjects,
    recurringRules,
    calendarEvents,
    attendanceRecords,
    publication,
    adoption,
    isActiveSetup,
  ] = await Promise.all([
    Subject.countDocuments({ setupId: setup._id }),
    RecurringRule.countDocuments({ setupId: setup._id }),
    CalendarEvent.countDocuments({ setupId: setup._id }),
    OccurrenceStatus.countDocuments({ setupId: setup._id }),
    SharedPublication.findOne({ sourceSetupId: setup._id, status: 'published' }).select(
      'title usedByCount'
    ),
    SetupCopy.findOne({ localSetupId: setup._id }).select('publicationId'),
    User.exists({ _id: userId, activeSetupId: setup._id }),
  ]);

  return {
    counts: {
      subjects,
      recurringRules,
      occurrences: occurrenceIds.length,
      attendanceRecords,
      calendarEvents,
    },
    publication: publication
      ? {
          id: publication._id,
          title: publication.title,
          usedBy: publication.usedByCount,
        }
      : null,
    copiedFrom: adoption ? { publicationId: adoption.publicationId } : null,
    isActiveSetup: Boolean(isActiveSetup),
  };
};

// Deletes the setup's own data only. Also used to roll back a half-finished adoption.
// Official collections hold no student data, so nothing there needs cleaning.
// (Lifecycle Section 7: also delete the setup's MassBunk records here.)
// const purgeSetupData = async (setupId) => {
//   const occurrenceIds = await Occurrence.distinct('_id', { setupId });

//   // By occurrence and by setup, so no status row is ever left behind
//   await OccurrenceStatus.deleteMany({
//     $or: [{ occurrenceId: { $in: occurrenceIds } }, { setupId }],
//   });
//   await Promise.all([
//     Occurrence.deleteMany({ setupId }),
//     RecurringRule.deleteMany({ setupId }),
//     Subject.deleteMany({ setupId }),
//     CalendarEvent.deleteMany({ setupId }),
//     ExtraClassAdjustment.deleteMany({ setupId }),
//   ]);

//   // Last, so a failure above leaves the setup in place and the delete retryable
//   await Setup.deleteOne({ _id: setupId });
// };

const purgeSetupData = async (setupId) => {
  const occurrenceIds = await Occurrence.distinct('_id', { setupId });

  // By occurrence and by setup, so no status row is ever left behind
  await OccurrenceStatus.deleteMany({
    $or: [{ occurrenceId: { $in: occurrenceIds } }, { setupId }],
  });
  await Promise.all([
    Occurrence.deleteMany({ setupId }),
    RecurringRule.deleteMany({ setupId }),
    Subject.deleteMany({ setupId }),
    CalendarEvent.deleteMany({ setupId }),
    ExtraClassAdjustment.deleteMany({ setupId }),
    SetupOfficialUpdate.deleteMany({ setupId }),
  ]);

  // Last, so a failure above leaves the setup in place and the delete retryable
  await Setup.deleteOne({ _id: setupId });
};

// Removes the copy record and gives back its contribution to the counters.
// Delete-then-adjust: a crash in between leaves drift the reconcile job repairs
const detachCopy = async (localSetupId) => {
  const copy = await SetupCopy.findOneAndDelete({ localSetupId });
  if (!copy) return false;

  await SharedPublication.updateOne(
    { _id: copy.publicationId, usedByCount: { $gt: 0 } },
    { $inc: { usedByCount: -1 } }
  );
  if (copy.rating) {
    await applyRatingDelta(copy.publicationId, -copy.rating, -1);
  }
  return true;
};

const deleteSetupWithChildren = async (setup, userId, { alsoUnpublish = false } = {}) => {
  const summary = { unpublished: 0, copyRecordRemoved: false };

  summary.copyRecordRemoved = await detachCopy(setup._id);

  if (alsoUnpublish) {
    const result = await SharedPublication.updateMany(
      { sourceSetupId: setup._id, status: 'published' },
      { $set: { status: 'unpublished' } }
    );
    summary.unpublished = result.modifiedCount;
  }
  // A publication is a snapshot, so it survives without its source setup
  await SharedPublication.updateMany(
    { sourceSetupId: setup._id },
    { $set: { sourceSetupId: null } }
  );

  await User.updateOne(
    { _id: userId, activeSetupId: setup._id },
    { $unset: { activeSetupId: 1 } }
  );

  await purgeSetupData(setup._id);
  return summary;
};

export {
  applyStartDateChange,
  applyEndDateChange,
  updateSetupDetails,
  getDeleteImpact,
  purgeSetupData,
  deleteSetupWithChildren,
};