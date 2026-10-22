import {
  ATTENDANCE_STATUS,
  CAUSE_TYPE,
  CAUSE_TYPE_TO_SOURCE,
  STATUS_SOURCE,
} from '../utils/constants.js';

// A calendar event may take a class from these (rule 3). The mark from before is kept.
const TAKEOVER_FROM = Object.freeze([CAUSE_TYPE.MASS_BUNK, CAUSE_TYPE.CLASS_CANCEL]);
// A student's own marks. skipMarked leaves these alone (used by the sync).
const STUDENT_MARKS = Object.freeze([
  ATTENDANCE_STATUS.PRESENT,
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.EXCUSED,
]);

// The one place that cancels and un-cancels classes. Calendar events, the official-date follow
// job, image-import confirmation and (later) mass bunk all call it, so the rules live here only.
//
// Rules (see OneCampus_Official_Dates_Spec.md §5.1):
//  1. Classes that are not_counted, or that the student cancelled themselves, are never touched.
//  2. A mass bunk never acts on a class a calendar event already cancels (holiday days count
//     for no other action).
//  3. A calendar event takes over a class held by a mass bunk. The mark from before the bunk is
//     kept, and the bunk's hold on that class is dropped.
//  4. When an event is removed or edited, a class is restored only if no other confirmed event
//     that affects classes still covers it. If one does, the class is handed to that event.
//  5. Every step is idempotent, so a failed request can be retried.

const CAUSE_VALUES = Object.values(CAUSE_TYPE);



const assertCause = (cause) => {
  if (!cause || !CAUSE_VALUES.includes(cause.type) || !cause.id) {
    throw new Error('A cancellation needs cause { type, id }');
  }
};

const isSameCause = (row, cause) =>
  row.causeType === cause.type && String(row.causeId) === String(cause.id);

// Finds the setup's classes that match the filter.
// filter: { from, to, subjectIds, classTypes, groups, occurrenceIds, time: { startTime, endTime } }
// groups: batch names to match; include null to match whole-section classes too.
// A filter with no condition at all is refused, so a bug can never cancel a whole setup.
const resolveOccurrences = async (setupId, filter = {}) => {
  const { from, to, subjectIds, classTypes, groups, occurrenceIds, time } = filter;
  const hasTime = Boolean(time?.startTime && time?.endTime);

  const hasCondition =
    from || to || hasTime ||
    Array.isArray(subjectIds) || Array.isArray(classTypes) || Array.isArray(groups) ||
    Array.isArray(occurrenceIds);
  if (!hasCondition) {
    throw new Error('A cancellation filter needs at least one condition');
  }

  const query = { setupId };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  // An empty array means "match nothing", never "match everything"
  if (Array.isArray(subjectIds)) query.subjectId = { $in: subjectIds };
  if (Array.isArray(occurrenceIds)) query._id = { $in: occurrenceIds };
  // Two HH:mm ranges overlap when each starts before the other ends. Plain string comparison
  // is correct for zero-padded HH:mm.
  if (hasTime) {
    query.plannedStartTime = { $lt: time.endTime };
    query.plannedEndTime = { $gt: time.startTime };
  }
  // classType and group are copied onto every class, so this also works for classes with no rule
  if (Array.isArray(classTypes)) query.classType = { $in: classTypes };
  if (Array.isArray(groups)) query.group = { $in: groups };

  return Occurrence.find(query).select('_id date').sort({ date: 1 }).lean();
};

// Decides, without writing, what applyCancellation would do. A mass bunk preview uses this.
// Returns:
//   toCancel:       [{ occurrenceId, date, mode: 'new' | 'takeover', previousStatus }]
//   alreadyApplied: ids this same cause already cancels
//   skipped:        { notCounted, userCancelled, heldByOther } (ids)
const planCancellation = async ({ setupId, userId, filter, cause, skipMarked = false }) => {
  assertCause(cause);

  const occurrences = await resolveOccurrences(setupId, filter);
  const plan = {
    matched: occurrences.length,
    toCancel: [],
    alreadyApplied: [],
    skipped: { notCounted: [], userCancelled: [], heldByOther: [], marked: [] },
  };
  if (!occurrences.length) return plan;

  const rows = await OccurrenceStatus.find({
    userId,
    occurrenceId: { $in: occurrences.map((occurrence) => occurrence._id) },
  }).lean();
  const rowByOccurrence = new Map(rows.map((row) => [String(row.occurrenceId), row]));

  for (const occurrence of occurrences) {
    const row = rowByOccurrence.get(String(occurrence._id));
    const base = { occurrenceId: occurrence._id, date: occurrence.date };

    if (row) {
      if (row.status === ATTENDANCE_STATUS.NOT_COUNTED) {
        plan.skipped.notCounted.push(occurrence._id);
        continue;
      }

      if (row.status === ATTENDANCE_STATUS.CANCELLED) {
        // Cancelled by the student themselves
        if (!row.causeType) {
          plan.skipped.userCancelled.push(occurrence._id);
          continue;
        }
        // Already cancelled by this same cause
        if (isSameCause(row, cause)) {
          plan.alreadyApplied.push(occurrence._id);
          continue;
        }
        // A calendar event may take a class from a mass bunk or a class cancel (rule 3)
        if (cause.type === CAUSE_TYPE.CALENDAR_EVENT && TAKEOVER_FROM.includes(row.causeType)) {
          plan.toCancel.push({
            ...base,
            mode: 'takeover',
            previousStatus: row.previousStatus ?? null,
            heldCauseType: row.causeType,
            heldCauseId: row.causeId,
          });
          continue;
        }
        // Held by another event or another cause: leave it where it is (rules 2 and 4)
        plan.skipped.heldByOther.push(occurrence._id);
        continue;
      }

      // Automatic callers (the sync) never overwrite a class the student marked
      if (skipMarked && STUDENT_MARKS.includes(row.status)) {
        plan.skipped.marked.push(occurrence._id);
        continue;
      }
    }

    // Overwrite and remember. A class nobody marked (no row, or pending) remembers nothing,
    // so removing the cause later drops the row and the class is pending again.
    const previousStatus =
      row && row.status !== ATTENDANCE_STATUS.PENDING ? row.status : null;
    plan.toCancel.push({ ...base, mode: 'new', previousStatus });
  }

  return plan;
};

const applyCancellation = async ({ setupId, userId, filter, cause, skipMarked = false }) => {
  const plan = await planCancellation({ setupId, userId, filter, cause, skipMarked });

  const operations = plan.toCancel.map((item) => {
    if (item.mode === 'takeover') {
      // previousStatus and reason stay as they are: it is still the mark from before the old cause
      return {
        updateOne: {
          filter: {
            occurrenceId: item.occurrenceId,
            userId,
            causeType: item.heldCauseType,
            causeId: item.heldCauseId,
          },
          update: {
            $set: {
              causeType: cause.type,
              causeId: cause.id,
              source: CAUSE_TYPE_TO_SOURCE[cause.type],
            },
          },
        },
      };
    }

    return {
      updateOne: {
        filter: { occurrenceId: item.occurrenceId, userId },
        update: {
          $set: {
            status: ATTENDANCE_STATUS.CANCELLED,
            previousStatus: item.previousStatus,
            reason: null,
            source: CAUSE_TYPE_TO_SOURCE[cause.type],
            setupId,
            causeType: cause.type,
            causeId: cause.id,
          },
        },
        upsert: true,
      },
    };
  });

  if (operations.length) {
    await OccurrenceStatus.bulkWrite(operations, { ordered: false });
  }

  return {
    cancelled: plan.toCancel.length,
    cancelledIds: plan.toCancel.map((item) => item.occurrenceId),
    alreadyApplied: plan.alreadyApplied.length,
    skipped: {
      notCounted: plan.skipped.notCounted.length,
      userCancelled: plan.skipped.userCancelled.length,
      heldByOther: plan.skipped.heldByOther.length,
      marked: plan.skipped.marked.length,
    },
  };
};

// Un-cancels everything one cause cancelled. Safe to run twice.
// Each write is guarded by the cause, so a row changed in the meantime is left alone.
const revertCause = async ({ setupId, userId, cause }) => {
  assertCause(cause);

  const rows = await OccurrenceStatus.find({
    userId,
    setupId,
    causeType: cause.type,
    causeId: cause.id,
  }).lean();
  const result = { restored: 0, removed: 0, relabeled: 0, total: rows.length };
  if (!rows.length) return result;

  // Rule 4: an event being removed or edited hands a class to another confirmed event that
  // still covers it, instead of restoring it. Mass bunks never overlap events (rule 2).
  let otherEvents = [];
  const dateByOccurrence = new Map();
  if (cause.type === CAUSE_TYPE.CALENDAR_EVENT) {
    const occurrences = await Occurrence.find({
      _id: { $in: rows.map((row) => row.occurrenceId) },
    })
      .select('date')
      .lean();
    occurrences.forEach((occurrence) =>
      dateByOccurrence.set(String(occurrence._id), occurrence.date.getTime())
    );

    const times = [...dateByOccurrence.values()];
    if (times.length) {
      otherEvents = await CalendarEvent.find({
        setupId,
        _id: { $ne: cause.id },
        confirmedAt: { $ne: null },
        affectsClasses: true,
        startDate: { $lte: new Date(Math.max(...times)) },
        endDate: { $gte: new Date(Math.min(...times)) },
      })
        .sort({ startDate: 1, _id: 1 })
        .select('_id startDate endDate')
        .lean();
    }
  }

  const guard = (row) => ({
    occurrenceId: row.occurrenceId,
    userId,
    causeType: cause.type,
    causeId: cause.id,
  });

  const operations = [];
  for (const row of rows) {
    const time = dateByOccurrence.get(String(row.occurrenceId));
    const cover =
      time === undefined
        ? undefined
        : otherEvents.find(
            (event) => event.startDate.getTime() <= time && event.endDate.getTime() >= time
          );

    if (cover) {
      operations.push({
        updateOne: { filter: guard(row), update: { $set: { causeId: cover._id } } },
      });
      result.relabeled += 1;
    } else if (row.previousStatus) {
      // Put back the mark the student had before the cause
      operations.push({
        updateOne: {
          filter: guard(row),
          update: {
            $set: {
              status: row.previousStatus,
              previousStatus: null,
              reason: null,
              source: STATUS_SOURCE.USER,
              causeType: null,
              causeId: null,
            },
          },
        },
      });
      result.restored += 1;
    } else {
      // Nothing had been marked: dropping the row makes the class pending again
      operations.push({ deleteOne: { filter: guard(row) } });
      result.removed += 1;
    }
  }

  if (operations.length) {
    await OccurrenceStatus.bulkWrite(operations, { ordered: false });
  }
  return result;
};

export { planCancellation, applyCancellation, revertCause }; 