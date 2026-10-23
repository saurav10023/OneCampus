import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import {
  createOneOffClass,
  editOccurrenceDetails,
  deleteOneOffClass,
} from '../services/occurrenceEdit.service.js';
import { nowInZone, weekBounds, toDateText, fromDateText, addDays, pickNextClass } from '../utils/dateWindow.js';
import { ATTENDANCE_STATUS, STATUS_SOURCE, CAUSE_TYPE, EVENT_SOURCE } from '../utils/constants.js';

const assertWritable = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};

const dateOf = (occurrence) => occurrence.date.toISOString().slice(0, 10); // UTC midnight

// Today's date in the setup's timezone, as YYYY-MM-DD
const todayIn = (timezone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

// ---------- The marking rules (single and bulk share them) ----------

const PROBLEMS = {
  not_counted: {
    httpStatus: 409,
    message: "This class is outside your setup's date range. Change the setup dates to count it.",
  },
  cancelled_by_cause: {
    httpStatus: 409,
    message:
      'This class was cancelled by a holiday, mass bunk or class cancel. Send overrideCancellation: true to mark it anyway.',
  },
  future_present: {
    httpStatus: 400,
    message: 'A class that has not happened yet cannot be marked present.',
  },
  locked_by_official: {
    httpStatus: 403,
    message:
      'This class is cancelled by an official schedule change (exam, holiday, mass bunk or class cancel). It cannot be marked.',
  },
  // Used only when clearing a mark: removing a cause's row would break its undo
  held_by_cause: {
    httpStatus: 409,
    message:
      'This class is cancelled by a holiday, mass bunk or class cancel, so there is no mark to clear. Mark it instead to override.',
  },
};

// Returns a problem code, or null when the mark is allowed
const checkMarkable = ({ occurrence, row, status, override, today }) => {
  if (row?.status === ATTENDANCE_STATUS.NOT_COUNTED) return 'not_counted';
  if (row?.locked) return 'locked_by_official'; // no override for official cancellations
  if (row?.causeType && !override) return 'cancelled_by_cause';
  if (status === ATTENDANCE_STATUS.PRESENT && dateOf(occurrence) > today) return 'future_present';
  return null;
};

// Returns a problem code, or null when the student's mark can be cleared (back to pending).
// A class with no row is already pending, so it is never a problem.
const checkClearable = ({ row }) => {
  if (row?.status === ATTENDANCE_STATUS.NOT_COUNTED) return 'not_counted';
  if (row?.locked) return 'locked_by_official';
  if (row?.causeType) return 'held_by_cause';
  return null;
};

// Every field is set here, because upserts and bulkWrite skip the model's validation hook.
// Clearing causeType, causeId and previousStatus is what makes an override a clean user mark.
const markFields = (status, setupId) => ({
  status,
  previousStatus: null,
  reason: null,
  source: STATUS_SOURCE.USER,
  causeType: null,
  causeId: null,
  setupId,
});

// Same mark again changes nothing
const isAlreadyMarked = (row, status) =>
  Boolean(row) && !row.causeType && row.status === status && row.source === STATUS_SOURCE.USER;

// ---------- Shaping the response ----------

const shapeOccurrence = (occurrence, row, subject) => {
  const status = row?.status ?? ATTENDANCE_STATUS.PENDING;
  let lock = null;
  if (status === ATTENDANCE_STATUS.NOT_COUNTED) lock = 'outside_range';
  else if (row?.locked) lock = 'official_cancellation'; // cannot be overridden
  else if (row?.causeType) lock = 'cancelled_by_cause'; // can be overridden

  return {
    id: occurrence._id,
    date: dateOf(occurrence),
    plannedStartTime: occurrence.plannedStartTime,
    plannedEndTime: occurrence.plannedEndTime,
    attendanceUnits: occurrence.attendanceUnits,
    classType: occurrence.classType,
    group: occurrence.group ?? null,
    sourceType: occurrence.sourceType,
    oneOff: occurrence.sourceType === 'manual_import',
    isCustomized: occurrence.isCustomized ?? false,
    recurringRuleId: occurrence.recurringRuleId ?? null,
    subject: subject
      ? { id: subject._id, name: subject.name, code: subject.code ?? null, color: subject.color ?? null }
      : { id: occurrence.subjectId },
    status,
    reason: row?.reason ?? null,
    source: row?.source ?? null,
    cancelledBy: row?.causeType ? { type: row.causeType, id: row.causeId } : null,
    // lock tells the app why a mark would be refused: outside_range, or cancelled_by_cause
    // (which can be overridden)
    lock,
  };
};

const loadRowsAndSubjects = async (userId, occurrences) => {
  const [rows, subjects] = await Promise.all([
    OccurrenceStatus.find({ userId, occurrenceId: { $in: occurrences.map((o) => o._id) } }).lean(),
    Subject.find({ _id: { $in: [...new Set(occurrences.map((o) => String(o.subjectId)))] } })
      .select('name code color')
      .lean(),
  ]);
  await annotateLocks(rows);
  return {
    rowByOccurrence: new Map(rows.map((r) => [String(r.occurrenceId), r])),
    subjectById: new Map(subjects.map((s) => [String(s._id), s])),
  };
};

// A class cancelled by an official cause cannot be marked, cleared or overridden by the student.
// Mass bunks and class cancels are always official. A calendar event is official when it came from
// the schedule. Sets row.locked on each row.
const annotateLocks = async (rows) => {
  const eventIds = [
    ...new Set(
      rows
        .filter((r) => r.causeType === CAUSE_TYPE.CALENDAR_EVENT && r.causeId)
        .map((r) => String(r.causeId))
    ),
  ];
  const officialEvents = new Set();
  if (eventIds.length) {
    const events = await CalendarEvent.find({ _id: { $in: eventIds }, source: EVENT_SOURCE.OFFICIAL })
      .select('_id')
      .lean();
    events.forEach((e) => officialEvents.add(String(e._id)));
  }
  for (const row of rows) {
    row.locked =
      row.causeType === CAUSE_TYPE.MASS_BUNK ||
      row.causeType === CAUSE_TYPE.CLASS_CANCEL ||
      (row.causeType === CAUSE_TYPE.CALENDAR_EVENT && officialEvents.has(String(row.causeId)));
  }
  return rows;
};

// ---------- Read ----------

// Everything in the range is returned in one response (the range is capped at 93 days).
const listOccurrences = asyncHandler(async (req, res) => {
  const { from, to, subjectId, status } = req.validatedQuery;

  const filter = { setupId: req.setup._id, date: { $gte: from, $lte: to } };
  if (subjectId) filter.subjectId = subjectId;

  const occurrences = await Occurrence.find(filter).sort({ date: 1, plannedStartTime: 1, _id: 1 }).lean();
  const { rowByOccurrence, subjectById } = await loadRowsAndSubjects(req.user._id, occurrences);

  let items = occurrences.map((o) =>
    shapeOccurrence(o, rowByOccurrence.get(String(o._id)), subjectById.get(String(o.subjectId)))
  );
  if (status) items = items.filter((item) => item.status === status);

  const summary = {};
  for (const item of items) summary[item.status] = (summary[item.status] ?? 0) + 1;

  return res
    .status(200)
    .json(new ApiResponse(200, { occurrences: items, count: items.length, summary }, 'Classes fetched successfully'));
});

const findOccurrence = async (req) => {
  const { occurrenceId } = req.params;
  if (!mongoose.isValidObjectId(occurrenceId)) throw new ApiError(400, 'Invalid occurrenceId');
  // Scoped to the setup, so another setup's class returns 404
  const occurrence = await Occurrence.findOne({ _id: occurrenceId, setupId: req.setup._id }).lean();
  if (!occurrence) throw new ApiError(404, 'Class not found');
  return occurrence;
};

const getOccurrence = asyncHandler(async (req, res) => {
  const occurrence = await findOccurrence(req);
  const { rowByOccurrence, subjectById } = await loadRowsAndSubjects(req.user._id, [occurrence]);
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { occurrence: shapeOccurrence(occurrence, rowByOccurrence.get(String(occurrence._id)), subjectById.get(String(occurrence.subjectId))) },
        'Class fetched successfully'
      )
    );
});

// ---------- Mark one ----------

const markOccurrence = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const occurrence = await findOccurrence(req);
  const { status, overrideCancellation } = req.body;
  const userId = req.user._id;

  const row = await OccurrenceStatus.findOne({ occurrenceId: occurrence._id, userId }).lean();
  if (row) await annotateLocks([row]);
  const problem = checkMarkable({
    occurrence,
    row,
    status,
    override: overrideCancellation,
    today: todayIn(req.setup.timezone),
  });
  if (problem) throw new ApiError(PROBLEMS[problem].httpStatus, PROBLEMS[problem].message);

  let saved = row;
  const changed = !isAlreadyMarked(row, status);
  if (changed) {
    saved = await OccurrenceStatus.findOneAndUpdate(
      { occurrenceId: occurrence._id, userId },
      { $set: markFields(status, req.setup._id) },
      { upsert: true, new: true }
    ).lean();
  }

  const { subjectById } = await loadRowsAndSubjects(userId, [occurrence]);
  return res.status(200).json(
    new ApiResponse(
      200,
      { occurrence: shapeOccurrence(occurrence, saved, subjectById.get(String(occurrence.subjectId))), changed },
      changed ? 'Attendance updated' : 'Already marked, nothing changed'
    )
  );
});

// ---------- Mark many ----------

// Locked classes are skipped and reported; the rest are applied. Safe to send twice.
const bulkMarkOccurrences = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const { status, overrideCancellation, occurrenceIds, from, to, subjectId } = req.body;
  const userId = req.user._id;
  const setupId = req.setup._id;

  let occurrences;
  if (occurrenceIds) {
    occurrences = await Occurrence.find({ _id: { $in: occurrenceIds }, setupId }).lean();
    if (occurrences.length !== occurrenceIds.length) {
      const found = new Set(occurrences.map((o) => String(o._id)));
      throw new ApiError(
        404,
        'Some classes were not found in this setup. Nothing was changed.',
        occurrenceIds.filter((id) => !found.has(id)).map((id) => `Not found: ${id}`)
      );
    }
  } else {
    const filter = { setupId, date: { $gte: from, $lte: to } };
    if (subjectId) filter.subjectId = subjectId;
    occurrences = await Occurrence.find(filter).lean();
  }

  if (!occurrences.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, { requested: 0, updated: 0, unchanged: 0, skipped: [] }, 'No classes matched. Nothing changed.'));
  }

  const rows = await OccurrenceStatus.find({ userId, occurrenceId: { $in: occurrences.map((o) => o._id) } }).lean();
  await annotateLocks(rows);
  const rowByOccurrence = new Map(rows.map((r) => [String(r.occurrenceId), r]));
  const today = todayIn(req.setup.timezone);

  const operations = [];
  const skipped = [];
  let unchanged = 0;

  for (const occurrence of occurrences) {
    const row = rowByOccurrence.get(String(occurrence._id));
    const problem = checkMarkable({ occurrence, row, status, override: overrideCancellation, today });
    if (problem) {
      skipped.push({ id: occurrence._id, date: dateOf(occurrence), reason: problem });
      continue;
    }
    if (isAlreadyMarked(row, status)) {
      unchanged += 1;
      continue;
    }
    operations.push({
      updateOne: {
        filter: { occurrenceId: occurrence._id, userId },
        update: { $set: markFields(status, setupId) },
        upsert: true,
      },
    });
  }

  if (operations.length) await OccurrenceStatus.bulkWrite(operations, { ordered: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      { requested: occurrences.length, updated: operations.length, unchanged, skipped },
      skipped.length
        ? `${operations.length} class(es) updated, ${skipped.length} skipped`
        : `${operations.length} class(es) updated`
    )
  );
});

// ---------- Clear a mark (back to pending) ----------

// DELETE /occurrences/:occurrenceId/mark
// Removes the student's own mark. Classes held by a holiday, mass bunk or class cancel are
// refused: their row is the record that lets the cause be undone.
const clearOccurrenceMark = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const occurrence = await findOccurrence(req);
  const userId = req.user._id;

  const row = await OccurrenceStatus.findOne({ occurrenceId: occurrence._id, userId }).lean();
  if (row) await annotateLocks([row]);
  const problem = checkClearable({ row });
  if (problem) throw new ApiError(PROBLEMS[problem].httpStatus, PROBLEMS[problem].message);

  const changed = Boolean(row) && row.status !== ATTENDANCE_STATUS.PENDING;
  if (row) {
    // causeType: null guards against a cause being applied between the read and the delete
    await OccurrenceStatus.deleteOne({ occurrenceId: occurrence._id, userId, causeType: null });
  }

  const { subjectById } = await loadRowsAndSubjects(userId, [occurrence]);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        occurrence: shapeOccurrence(occurrence, null, subjectById.get(String(occurrence.subjectId))),
        changed,
      },
      changed ? 'Mark cleared' : 'Already pending, nothing changed'
    )
  );
});

// POST /occurrences/bulk-clear   body: { occurrenceIds } or { from, to, subjectId? }
// Same selection as bulk mark. Locked and cause-held classes are skipped and reported.
const bulkClearOccurrences = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const { occurrenceIds, from, to, subjectId } = req.body;
  const userId = req.user._id;
  const setupId = req.setup._id;

  let occurrences;
  if (occurrenceIds) {
    occurrences = await Occurrence.find({ _id: { $in: occurrenceIds }, setupId }).lean();
    if (occurrences.length !== occurrenceIds.length) {
      const found = new Set(occurrences.map((o) => String(o._id)));
      throw new ApiError(
        404,
        'Some classes were not found in this setup. Nothing was changed.',
        occurrenceIds.filter((id) => !found.has(id)).map((id) => `Not found: ${id}`)
      );
    }
  } else {
    const filter = { setupId, date: { $gte: from, $lte: to } };
    if (subjectId) filter.subjectId = subjectId;
    occurrences = await Occurrence.find(filter).lean();
  }

  if (!occurrences.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, { requested: 0, cleared: 0, unchanged: 0, skipped: [] }, 'No classes matched. Nothing changed.'));
  }

  const rows = await OccurrenceStatus.find({ userId, occurrenceId: { $in: occurrences.map((o) => o._id) } }).lean();
  await annotateLocks(rows);
  const rowByOccurrence = new Map(rows.map((r) => [String(r.occurrenceId), r]));

  const operations = [];
  const skipped = [];
  let unchanged = 0;

  for (const occurrence of occurrences) {
    const row = rowByOccurrence.get(String(occurrence._id));
    const problem = checkClearable({ row });
    if (problem) {
      skipped.push({ id: occurrence._id, date: dateOf(occurrence), reason: problem });
      continue;
    }
    if (!row || row.status === ATTENDANCE_STATUS.PENDING) {
      unchanged += 1;
      continue;
    }
    operations.push({
      deleteOne: { filter: { occurrenceId: occurrence._id, userId, causeType: null } },
    });
  }

  if (operations.length) await OccurrenceStatus.bulkWrite(operations, { ordered: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      { requested: occurrences.length, cleared: operations.length, unchanged, skipped },
      skipped.length
        ? `${operations.length} mark(s) cleared, ${skipped.length} skipped`
        : `${operations.length} mark(s) cleared`
    )
  );
});

// ---------- One-off class, single-class edit, delete ----------

const createClass = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const result = await createOneOffClass({ setup: req.setup, userId: req.user._id, input: req.body });
  return res.status(201).json(new ApiResponse(201, result, 'Class added successfully'));
});

const editClass = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const { occurrenceId } = req.params;
  if (!mongoose.isValidObjectId(occurrenceId)) throw new ApiError(400, 'Invalid occurrenceId');
  const result = await editOccurrenceDetails({
    setup: req.setup,
    userId: req.user._id,
    occurrenceId,
    input: req.body,
  });
  return res
    .status(200)
    .json(new ApiResponse(200, result, result.changed ? 'Class updated' : 'Nothing changed'));
});

const deleteClass = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const { occurrenceId } = req.params;
  if (!mongoose.isValidObjectId(occurrenceId)) throw new ApiError(400, 'Invalid occurrenceId');
  const result = await deleteOneOffClass({
    setup: req.setup,
    userId: req.user._id,
    occurrenceId,
    confirm: req.body.confirm,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Class deleted'));
});

// ---------- Day and week views ----------

const countByStatus = (classes) => {
  const summary = {};
  for (const item of classes) summary[item.status] = (summary[item.status] ?? 0) + 1;
  return summary;
};

const eventFields = (event) => ({
  id: event._id,
  title: event.title,
  type: event.type,
  startDate: toDateText(event.startDate),
  endDate: toDateText(event.endDate),
  affectsClasses: event.affectsClasses,
});

// The main screen: one day's classes with their marks, the next class, and what comes after.
// GET /occurrences/today            today in the setup's timezone
// GET /occurrences/today?date=...   any other day
const getDay = asyncHandler(async (req, res) => {
  const { setup, user } = req;
  const now = nowInZone(setup.timezone);
  const date = req.validatedQuery.date ?? fromDateText(now.date);
  const dateText = toDateText(date);
  const isToday = dateText === now.date;

  const occurrences = await Occurrence.find({ setupId: setup._id, date })
    .sort({ plannedStartTime: 1, _id: 1 })
    .lean();
  const { rowByOccurrence, subjectById } = await loadRowsAndSubjects(user._id, occurrences);
  const classes = occurrences.map((o) =>
    shapeOccurrence(o, rowByOccurrence.get(String(o._id)), subjectById.get(String(o.subjectId)))
  );

  const [events, following] = await Promise.all([
    CalendarEvent.find({
      setupId: setup._id,
      confirmedAt: { $ne: null },
      startDate: { $lte: date },
      endDate: { $gte: date },
    })
      .select('title type startDate endDate affectsClasses')
      .lean(),
    Occurrence.findOne({ setupId: setup._id, date: { $gt: date } }).sort({ date: 1 }).select('date').lean(),
  ]);

  let nextDay = null;
  if (following) {
    const classCount = await Occurrence.countDocuments({ setupId: setup._id, date: following.date });
    nextDay = { date: toDateText(following.date), classCount };
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date: dateText,
        isToday,
        isWithinSetup: date >= setup.startDate && date <= setup.endDate,
        now: isToday ? now.time : null,
        classes,
        count: classes.length,
        summary: countByStatus(classes),
        // only for today: the first class that has not started and is still going ahead
        nextClass: isToday ? pickNextClass(classes, now.time) : null,
        events: events.map(eventFields),
        nextDay,
      },
      'Day fetched successfully'
    )
  );
});

// Seven days grouped by date, with the calendar events that touch the week
// GET /occurrences/week?date=2026-10-22&weekStart=1
const getWeek = asyncHandler(async (req, res) => {
  const { setup, user } = req;
  const { date, weekStart } = req.validatedQuery;
  const now = nowInZone(setup.timezone);
  const { start, end } = weekBounds(date ?? fromDateText(now.date), weekStart);

  const occurrences = await Occurrence.find({ setupId: setup._id, date: { $gte: start, $lte: end } })
    .sort({ date: 1, plannedStartTime: 1, _id: 1 })
    .lean();
  const [{ rowByOccurrence, subjectById }, events] = await Promise.all([
    loadRowsAndSubjects(user._id, occurrences),
    CalendarEvent.find({
      setupId: setup._id,
      confirmedAt: { $ne: null },
      startDate: { $lte: end },
      endDate: { $gte: start },
    })
      .select('title type startDate endDate affectsClasses')
      .sort({ startDate: 1 })
      .lean(),
  ]);

  const byDate = new Map();
  for (const o of occurrences) {
    const key = toDateText(o.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate
      .get(key)
      .push(shapeOccurrence(o, rowByOccurrence.get(String(o._id)), subjectById.get(String(o.subjectId))));
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const key = toDateText(day);
    const classes = byDate.get(key) ?? [];
    return {
      date: key,
      weekday: day.getUTCDay(),
      isToday: key === now.date,
      classes,
      count: classes.length,
      summary: countByStatus(classes),
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        weekStart: toDateText(start),
        weekEnd: toDateText(end),
        days,
        totalClasses: occurrences.length,
        events: events.map(eventFields),
      },
      'Week fetched successfully'
    )
  );
});

export {
  listOccurrences,
  getOccurrence,
  markOccurrence,
  bulkMarkOccurrences,
  clearOccurrenceMark,
  bulkClearOccurrences,
  createClass,
  editClass,
  deleteClass,
  getDay,
  getWeek,
};