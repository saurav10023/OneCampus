import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import { ATTENDANCE_STATUS, STATUS_SOURCE } from '../utils/constants.js';

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
};

// Returns a problem code, or null when the mark is allowed
const checkMarkable = ({ occurrence, row, status, override, today }) => {
  if (row?.status === ATTENDANCE_STATUS.NOT_COUNTED) return 'not_counted';
  if (row?.causeType && !override) return 'cancelled_by_cause';
  if (status === ATTENDANCE_STATUS.PRESENT && dateOf(occurrence) > today) return 'future_present';
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
  else if (row?.causeType) lock = 'cancelled_by_cause';

  return {
    id: occurrence._id,
    date: dateOf(occurrence),
    plannedStartTime: occurrence.plannedStartTime,
    plannedEndTime: occurrence.plannedEndTime,
    attendanceUnits: occurrence.attendanceUnits,
    classType: occurrence.classType,
    group: occurrence.group ?? null,
    sourceType: occurrence.sourceType,
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
  return {
    rowByOccurrence: new Map(rows.map((r) => [String(r.occurrenceId), r])),
    subjectById: new Map(subjects.map((s) => [String(s._id), s])),
  };
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

export { listOccurrences, getOccurrence, markOccurrence, bulkMarkOccurrences };