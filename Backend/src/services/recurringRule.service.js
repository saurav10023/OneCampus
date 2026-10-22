import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import Setup from '../models/TimeTable/setup.model.js';
// CHECK PATH: adjust to wherever calendarEvent.model.js lives in your project
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import { generateOccurrences } from './occurrence.service.js';
import { applyCancellation } from './cancellation.service.js';
import { CAUSE_TYPE, DAY_MS, ORIGIN } from '../utils/constants.js';

const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

// --- pure helpers start
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Zero-padded HH:mm strings compare correctly as text
const timesOverlap = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;
const rangesOverlap = (a, b) =>
  a.effectiveStartDate <= b.effectiveEndDate && b.effectiveStartDate <= a.effectiveEndDate;
// Two different named groups never clash: a student belongs to one batch
const groupsClash = (a, b) => !(a.group && b.group && a.group !== b.group);
const rulesClash = (a, b) =>
  a.weekday === b.weekday && timesOverlap(a, b) && rangesOverlap(a, b) && groupsClash(a, b);

const describeRule = (rule, subjectName) =>
  `${subjectName} (${WEEKDAY_NAMES[rule.weekday]} ${rule.startTime}-${rule.endTime}` +
  `${rule.group ? `, ${rule.group}` : ''})`;
// --- pure helpers end

// A saved class row that is only a cancellation cause (an event or mass bunk) with nothing
// remembered carries no student data: it is recomputed from the event, so it can be dropped
const isCauseOnlyRow = (row) => Boolean(row.causeType) && row.previousStatus == null;

// Messages for active rules in the same setup that clash with `candidate`. Never blocks anything:
// the controller decides, using confirmOverlap.
const findOverlaps = async ({ setupId, candidate, subjectName, excludeRuleId }) => {
  if (candidate.isActive === false) return [];

  const query = { setupId, isActive: true, weekday: candidate.weekday };
  if (excludeRuleId) query._id = { $ne: excludeRuleId };

  const others = await RecurringRule.find(query).populate('subjectId', 'name').lean();

  return others
    .filter((other) => rulesClash(candidate, other))
    .map(
      (other) =>
        `${describeRule(candidate, subjectName)} overlaps with ` +
        `${describeRule(other, other.subjectId?.name ?? 'another subject')}`
    );
};

// Cancels newly generated classes that fall on a confirmed holiday, break or exam.
// The shared service skips classes that are already cancelled, so running it twice is safe.
const reapplyConfirmedEvents = async ({ setupId, userId, ruleId, from, to }) => {
  const events = await CalendarEvent.find({
    setupId,
    confirmedAt: { $ne: null },
    affectsClasses: true,
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .sort({ startDate: 1 })
    .lean();

  let cancelled = 0;
  for (const event of events) {
    const eventFrom = maxDate(event.startDate, from);
    const eventTo = minDate(event.endDate, to);
    const occurrenceIds = await Occurrence.distinct('_id', {
      setupId,
      recurringRuleId: ruleId,
      date: { $gte: eventFrom, $lte: eventTo },
    });
    if (!occurrenceIds.length) continue;

    const result = await applyCancellation({
      setupId,
      userId,
      filter: { from: eventFrom, to: eventTo, occurrenceIds },
      cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id },
    });
    cancelled += result.cancelled;
  }
  return cancelled;
};

// First generation for a rule that was just saved. Safe to run again.
const generateForRule = async ({ setupId, userId, rule }) => {
  const desired = rule.toObject();
  if (!desired.isActive) return { generated: 0, cancelledByEvents: 0 };

  const generated = await generateOccurrences(
    setupId,
    desired.effectiveStartDate,
    desired.effectiveEndDate,
    { rules: [desired] }
  );
  const cancelledByEvents = generated
    ? await reapplyConfirmedEvents({
        setupId,
        userId,
        ruleId: desired._id,
        from: desired.effectiveStartDate,
        to: desired.effectiveEndDate,
      })
    : 0;

  return { generated, cancelledByEvents };
};

// Brings the rule's classes from `boundary` onward in line with the rule's NEW values.
// `desired` is the rule as it will be saved, but it is not saved yet: the controller saves the
// rule last, so a crash here leaves the rule unchanged and the same request can simply be sent
// again. Every step is idempotent.
//
// Classes before `boundary` are never touched, except when the rule's start date moves earlier,
// in which case the new earlier classes are added.
//
// Marks are never lost: a class that no longer matches but has any attendance data is kept and
// counted in `keptWithData`.
const syncRuleOccurrences = async ({ setupId, userId, desired, previous, boundary }) => {
  const ruleId = desired._id;
  const weekdayMatches = { $eq: [{ $dayOfWeek: '$date' }, desired.weekday + 1] };
  const result = { updated: 0, removed: 0, keptWithData: 0, generated: 0, cancelledByEvents: 0 };

  // (a) Classes that still belong keep their marks. Refresh the details copied onto them.
  if (desired.isActive) {
    const updated = await Occurrence.updateMany(
      {
        setupId,
        recurringRuleId: ruleId,
        date: {
          $gte: maxDate(boundary, desired.effectiveStartDate),
          $lte: desired.effectiveEndDate,
        },
        $expr: weekdayMatches,
      },
      {
        $set: {
          subjectId: desired.subjectId,
          plannedStartTime: desired.startTime,
          plannedEndTime: desired.endTime,
          attendanceUnits: desired.attendanceUnits,
          classType: desired.classType,
          group: desired.group ?? null,
          generatedRuleVersion: desired.ruleVersion,
        },
      }
    );
    result.updated = updated.modifiedCount;
  }

  // (b) Classes that no longer belong: wrong weekday, outside the new dates, or rule switched off
  const fromBoundary = { setupId, recurringRuleId: ruleId, date: { $gte: boundary } };
  const staleFilter = desired.isActive
    ? {
        ...fromBoundary,
        $or: [
          { date: { $lt: desired.effectiveStartDate } },
          { date: { $gt: desired.effectiveEndDate } },
          { $expr: { $ne: [{ $dayOfWeek: '$date' }, desired.weekday + 1] } },
        ],
      }
    : fromBoundary;

  const staleIds = await Occurrence.distinct('_id', staleFilter);
  if (staleIds.length) {
    const rows = await OccurrenceStatus.find({
      userId,
      occurrenceId: { $in: staleIds },
    })
      .select('occurrenceId causeType previousStatus')
      .lean();

    const keep = new Set();
    const dropRowIds = [];
    for (const row of rows) {
      if (isCauseOnlyRow(row)) dropRowIds.push(row._id);
      else keep.add(String(row.occurrenceId));
    }

    const removableIds = staleIds.filter((id) => !keep.has(String(id)));
    // Status rows go first, so a crash never leaves a row pointing at a deleted class
    if (dropRowIds.length) await OccurrenceStatus.deleteMany({ _id: { $in: dropRowIds } });
    if (removableIds.length) await Occurrence.deleteMany({ _id: { $in: removableIds } });

    result.removed = removableIds.length;
    result.keptWithData = staleIds.length - removableIds.length;
  }

  // (c) Add classes that are missing
  if (desired.isActive) {
    const ranges = [];
    const from = maxDate(desired.effectiveStartDate, boundary);
    if (from <= desired.effectiveEndDate) ranges.push([from, desired.effectiveEndDate]);
    if (desired.effectiveStartDate < previous.effectiveStartDate) {
      ranges.push([
        desired.effectiveStartDate,
        minDate(desired.effectiveEndDate, addDays(previous.effectiveStartDate, -1)),
      ]);
    }

    for (const [rangeFrom, rangeTo] of ranges) {
      if (rangeFrom > rangeTo) continue;
      result.generated += await generateOccurrences(setupId, rangeFrom, rangeTo, {
        rules: [desired],
      });
    }

    // (d) New classes that fall on a confirmed holiday, break or exam are cancelled
    if (result.generated && ranges.length) {
      const earliest = ranges.reduce((min, [start]) => minDate(min, start), ranges[0][0]);
      result.cancelledByEvents = await reapplyConfirmedEvents({
        setupId,
        userId,
        ruleId,
        from: earliest,
        to: desired.effectiveEndDate,
      });
    }
  }

  return result;
};

// What deleting a rule would destroy, so the client can show it first
const getRuleDeleteImpact = async (rule, userId) => {
  const occurrenceIds = await Occurrence.distinct('_id', {
    setupId: rule.setupId,
    recurringRuleId: rule._id,
  });

  let recordedClasses = 0;
  if (occurrenceIds.length) {
    const rows = await OccurrenceStatus.find({
      userId,
      occurrenceId: { $in: occurrenceIds },
    })
      .select('causeType previousStatus')
      .lean();
    recordedClasses = rows.filter((row) => !isCauseOnlyRow(row)).length;
  }

  return {
    classes: occurrenceIds.length,
    recordedClasses,
    isOfficial: rule.origin === ORIGIN.OFFICIAL,
  };
};

// Order: statuses, then classes, then the rule last, so a failure can be retried.
// An official rule is also added to the setup's hidden list so the next sync does not add it back.
const deleteRuleWithChildren = async ({ setup, rule, userId }) => {
  const occurrenceIds = await Occurrence.distinct('_id', {
    setupId: setup._id,
    recurringRuleId: rule._id,
  });

  let deletedStatuses = 0;
  if (occurrenceIds.length) {
    const statusResult = await OccurrenceStatus.deleteMany({
      userId,
      occurrenceId: { $in: occurrenceIds },
    });
    deletedStatuses = statusResult.deletedCount;
    await Occurrence.deleteMany({ _id: { $in: occurrenceIds } });
  }

  let hidden = false;
  if (rule.origin === ORIGIN.OFFICIAL && rule.officialRuleId) {
    // Needs `officialOptOuts: [{ kind, id }]` in the Setup schema, or this write is ignored
    await Setup.updateOne(
      { _id: setup._id },
      { $addToSet: { officialOptOuts: { kind: 'rule', id: rule.officialRuleId } } }
    );
    hidden = true;
  }

  await RecurringRule.deleteOne({ _id: rule._id });

  return { deletedClasses: occurrenceIds.length, deletedStatuses, hiddenFromSync: hidden };
};

export {
  findOverlaps,
  generateForRule,
  syncRuleOccurrences,
  getRuleDeleteImpact,
  deleteRuleWithChildren,
};