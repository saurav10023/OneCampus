import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import { ATTENDANCE_STATUS, STATUS_SOURCE, CLASS_TYPE, DAY_MS } from '../utils/constants.js';

const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);

// Generates classes for active rules inside [from, to] (inclusive, UTC dates).
// Upserts on setupId + recurringRuleId + date, so calling it twice never duplicates
// options.rules:   plain rule objects to generate from instead of reading rules from the database.
//                  The rule service passes the new values of a rule that is not saved yet.
// options.ruleIds: limit the run to these saved rules.
const generateOccurrences = async (setupId, from, to, { rules: givenRules, ruleIds } = {}) => {
  const rules =
    givenRules ??
    (await RecurringRule.find({
      setupId,
      isActive: true,
      ...(ruleIds ? { _id: { $in: ruleIds } } : {}),
    }));
  const operations = [];

  for (const rule of rules) {
    const start = maxDate(from, rule.effectiveStartDate);
    const end = minDate(to, rule.effectiveEndDate);
    if (start > end) continue;

    // Jump straight to the first matching weekday, then step a week at a time
    const offset = (rule.weekday - start.getUTCDay() + 7) % 7;
    for (let t = start.getTime() + offset * DAY_MS; t <= end.getTime(); t += 7 * DAY_MS) {
      operations.push({
        updateOne: {
          filter: { setupId, recurringRuleId: rule._id, date: new Date(t) },
          update: {
            $setOnInsert: {
              subjectId: rule.subjectId,
              plannedStartTime: rule.startTime,
              plannedEndTime: rule.endTime,
              attendanceUnits: rule.attendanceUnits,
              sourceType: 'recurring_rule',
              generatedRuleVersion: rule.ruleVersion,
              // Copied onto the class so mass bunk can match without looking up the rule.
              // Rules saved before classType existed count as lectures.
              classType: rule.classType ?? CLASS_TYPE.LECTURE,
              group: rule.group ?? null,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (!operations.length) return 0;
  const result = await Occurrence.bulkWrite(operations, { ordered: false });
  return result.upsertedCount;
};

const getOccurrenceIdsInRange = (setupId, from, to) =>
  Occurrence.distinct('_id', { setupId, date: { $gte: from, $lte: to } });

// Every row written here is a system change that has no cancellation cause. The cause fields
// are cleared explicitly because bulkWrite skips the model's validation hook.
// setupId is set on every write: an upsert would otherwise create the row without it.
const statusUpsert = (occurrenceId, userId, setupId, fields) => ({
  updateOne: {
    filter: { occurrenceId, userId },
    update: {
      $set: {
        ...fields,
        setupId,
        causeType: null,
        causeId: null,
        source: STATUS_SOURCE.SYSTEM,
      },
    },
    upsert: true,
  },
});

// Keeps one user's statuses consistent after a setup date range changes.
// shrinking: classes leaving the range become not_counted (old status remembered).
// growing:   classes this same change had uncounted are restored; brand-new classes
//            (no status row yet) get `newStatus`. Anything the user set stays untouched
//
// A class cancelled by a calendar event or mass bunk is treated like any other class when it
// leaves the range: it becomes not_counted and the cancellation cause is dropped. What it
// remembers is the mark from before the cause. The caller must re-apply confirmed events to
// `restoredIds` and `addedIds` after a growing change (see cancellation.service.js).
//
// Returns counts plus the ids in each group so the caller can do that.
const reconcileRangeStatuses = async ({
  occurrenceIds,
  userId,
  shrinking,
  reason,
  newStatus,
}) => {
  const empty = { affected: 0, restored: 0, uncountedIds: [], restoredIds: [], addedIds: [] };
  if (!occurrenceIds.length) return empty;

  const [rows, occurrences] = await Promise.all([
    OccurrenceStatus.find({ userId, occurrenceId: { $in: occurrenceIds } }),
    Occurrence.find({ _id: { $in: occurrenceIds } }).select('setupId').lean(),
  ]);
  const rowByOccurrence = new Map(rows.map((row) => [String(row.occurrenceId), row]));
  const setupByOccurrence = new Map(
    occurrences.map((occurrence) => [String(occurrence._id), occurrence.setupId])
  );

  const operations = [];
  const uncountedIds = [];
  const restoredIds = [];
  const addedIds = [];

  for (const occurrenceId of occurrenceIds) {
    const setupId = setupByOccurrence.get(String(occurrenceId));
    if (!setupId) continue; // the class no longer exists
    const row = rowByOccurrence.get(String(occurrenceId));

    if (shrinking) {
      if (row?.status === ATTENDANCE_STATUS.NOT_COUNTED) continue;

      // Held by an event or mass bunk: remember the mark from before that cause.
      // Otherwise remember the current mark.
      const previousStatus = row?.causeType
        ? row.previousStatus ?? ATTENDANCE_STATUS.PENDING
        : row?.status ?? ATTENDANCE_STATUS.PENDING;

      operations.push(
        statusUpsert(occurrenceId, userId, setupId, {
          status: ATTENDANCE_STATUS.NOT_COUNTED,
          previousStatus,
          reason,
        })
      );
      uncountedIds.push(occurrenceId);
    } else if (row?.status === ATTENDANCE_STATUS.NOT_COUNTED && row.reason === reason) {
      operations.push(
        statusUpsert(occurrenceId, userId, setupId, {
          status: row.previousStatus ?? ATTENDANCE_STATUS.PENDING,
          previousStatus: null,
          reason: null,
        })
      );
      restoredIds.push(occurrenceId);
    } else if (!row) {
      operations.push(
        statusUpsert(occurrenceId, userId, setupId, {
          status: newStatus,
          previousStatus: null,
          reason,
        })
      );
      addedIds.push(occurrenceId);
    }
  }

  if (operations.length) {
    await OccurrenceStatus.bulkWrite(operations, { ordered: false });
  }
  return {
    affected: uncountedIds.length + addedIds.length,
    restored: restoredIds.length,
    uncountedIds,
    restoredIds,
    addedIds,
  };
};

export { generateOccurrences, getOccurrenceIdsInRange, reconcileRangeStatuses };