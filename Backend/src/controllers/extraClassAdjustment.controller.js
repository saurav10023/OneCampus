import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Subject from '../models/TimeTable/subject.model.js';
import ExtraClassAdjustment from '../models/Attendance/extraClassAdjustment.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import { ATTENDANCE_STATUS, STATUS_SOURCE } from '../utils/constants.js';
import {
  applyDelta,
  unrecordedOf,
  sameCounts,
  matchCollegeRecord,
  shouldSuggestStartingBalance,
} from '../utils/extraClassMath.js';
import { percentOf } from '../utils/attendanceMath.js';
import { nowInZone, fromDateText } from '../utils/dateWindow.js';
import { getAttendance } from '../services/attendance.service.js';

const ZERO = Object.freeze({ totalCount: 0, attendedCount: 0, missedCount: 0 });

const assertWritable = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};

const conflictError = () =>
  new ApiError(409, 'This was changed by another request at the same time. Send it again.');

// The subject must belong to this setup. Another setup's subject id returns 404.
const findSubject = async (req) => {
  const { subjectId } = req.params;
  if (!mongoose.isValidObjectId(subjectId)) throw new ApiError(400, 'Invalid subjectId');
  const subject = await Subject.findOne({ _id: subjectId, setupId: req.setup._id })
    .select('name code isActive')
    .lean();
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
};

// New extra classes cannot be added to an archived subject (reading and deleting still work)
const assertSubjectActive = (subject) => {
  if (subject.isActive === false) {
    throw new ApiError(409, 'This subject is archived. Restore it before changing its extra classes.');
  }
};

const countsOf = (a) => ({
  totalCount: a.totalCount,
  attendedCount: a.attendedCount,
  missedCount: a.missedCount,
});

const shape = (adjustment, subject) => ({
  subject: subject
    ? { id: subject._id, name: subject.name, code: subject.code ?? null, isActive: subject.isActive !== false }
    : { id: adjustment.subjectId },
  ...countsOf(adjustment),
  unrecordedCount: unrecordedOf(adjustment),
  note: adjustment.note ?? null,
  updatedAt: adjustment.updatedAt,
});

// note: undefined = leave it, null = remove it, text = set it
const withNote = (update, note) => {
  if (note === undefined) return update;
  if (note === null) return { ...update, $unset: { note: 1 } };
  return { ...update, $set: { ...update.$set, note } };
};

const noteFields = (note) => (typeof note === 'string' ? { note } : {});
const sameNote = (current, note) => note === undefined || (note ?? null) === (current?.note ?? null);

// ---------- Read ----------

const listAdjustments = asyncHandler(async (req, res) => {
  const { setup, user } = req;
  const [adjustments, subjects, hasMarks] = await Promise.all([
    ExtraClassAdjustment.find({ setupId: setup._id }).lean(),
    Subject.find({ setupId: setup._id }).select('name code isActive').lean(),
    // Only marks the student made themselves, not classes the system added
    OccurrenceStatus.exists({
      userId: user._id,
      setupId: setup._id,
      source: STATUS_SOURCE.USER,
      status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT] },
    }),
  ]);
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));

  const items = adjustments
    .map((a) => shape(a, subjectById.get(String(a.subjectId))))
    .sort((a, b) => (a.subject.name ?? '').localeCompare(b.subject.name ?? ''));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        adjustments: items,
        count: items.length,
        // true: ask "do you already have classes recorded?" (nothing entered, nothing marked,
        // and the setup started at least a week ago)
        suggestStartingBalance: shouldSuggestStartingBalance({
          adjustmentCount: adjustments.length,
          setupStart: setup.startDate,
          today: fromDateText(nowInZone(setup.timezone).date),
          hasMarks: Boolean(hasMarks),
        }),
      },
      'Extra classes fetched successfully'
    )
  );
});

const getAdjustment = asyncHandler(async (req, res) => {
  const subject = await findSubject(req);
  const adjustment = await ExtraClassAdjustment.findOne({ setupId: req.setup._id, subjectId: subject._id }).lean();
  if (!adjustment) throw new ApiError(404, 'No extra classes recorded for this subject');

  return res
    .status(200)
    .json(new ApiResponse(200, { adjustment: shape(adjustment, subject) }, 'Extra classes fetched successfully'));
});

// ---------- Set exact counts ----------

// Safe to send twice: the same counts end up stored either way
const setAdjustment = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);
  assertSubjectActive(subject);

  const { note, ...counts } = req.body;
  let adjustment;
  try {
    adjustment = await ExtraClassAdjustment.findOneAndUpdate(
      { setupId: req.setup._id, subjectId: subject._id },
      withNote({ $set: counts }, note),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (err) {
    // Two first-time requests at once: the unique index let only one create it
    if (err?.code === 11000) throw conflictError();
    throw err;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { adjustment: shape(adjustment, subject) }, 'Extra classes saved'));
});

// ---------- Change by amounts ----------

const changeAdjustment = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);
  assertSubjectActive(subject);

  const { expected, note, ...delta } = req.body;
  const filter = { setupId: req.setup._id, subjectId: subject._id };
  const current = await ExtraClassAdjustment.findOne(filter).lean();
  const base = current ? countsOf(current) : ZERO;

  // The app says what it last saw. If the counts moved, this change (or an earlier try of it)
  // was already applied by something else, so refuse rather than count twice.
  if (expected && !sameCounts(base, expected)) {
    throw new ApiError(409, 'The counts changed since you last loaded them', [
      `Current counts: total ${base.totalCount}, attended ${base.attendedCount}, missed ${base.missedCount}.`,
      'Reload and check. If you sent this change before, it may already have been applied.',
    ]);
  }

  const { next, errors } = applyDelta(base, delta);
  if (errors.length) throw new ApiError(400, 'That change is not possible', errors);

  const countsChanged = !sameCounts(base, next);
  if (!current && !countsChanged) {
    throw new ApiError(400, 'Add at least one extra class before adding a note');
  }
  if (current && !countsChanged && sameNote(current, note)) {
    return res
      .status(200)
      .json(new ApiResponse(200, { adjustment: shape(current, subject), changed: false }, 'Nothing changed'));
  }

  let adjustment;
  try {
    if (!current) {
      adjustment = (await ExtraClassAdjustment.create({ ...filter, ...next, ...noteFields(note) })).toObject();
    } else {
      // Compare-and-swap: only writes if nobody changed the counters since they were read,
      // so two requests at once can never lose an update
      adjustment = await ExtraClassAdjustment.findOneAndUpdate(
        { _id: current._id, ...base },
        withNote({ $set: { ...next } }, note),
        { new: true }
      ).lean();
      if (!adjustment) throw conflictError();
    }
  } catch (err) {
    if (err?.code === 11000) throw conflictError();
    throw err;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { adjustment: shape(adjustment, subject), changed: true }, 'Extra classes updated'));
});

// ---------- Match the college's record ----------

// The student types what the college's record says for this subject. The extra-class counters
// are set so the app shows exactly those numbers. Announced extras that are still undecided
// are kept. The previous counts are returned, so the app can offer an undo (send them to PUT).
const matchRecord = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);
  assertSubjectActive(subject);

  const { collegeAttended, collegeHeld, note } = req.body;

  const data = await getAttendance({ setup: req.setup, userId: req.user._id, includeArchived: true });
  const entry = data.subjects.find((s) => String(s.subject.id) === String(subject._id));
  if (!entry) throw new ApiError(404, 'Subject not found');

  const filter = { setupId: req.setup._id, subjectId: subject._id };
  const current = await ExtraClassAdjustment.findOne(filter).lean();

  const { next, errors } = matchCollegeRecord({
    timetableAttended: entry.timetable.attendedUnits,
    timetableHeld: entry.timetable.heldUnits,
    collegeAttended,
    collegeHeld,
    unrecordedExtras: current ? Math.max(0, unrecordedOf(current)) : 0,
  });
  if (errors.length) throw new ApiError(400, 'Cannot match the college record', errors);

  const result = {
    previous: current ? { ...countsOf(current), note: current.note ?? null } : null,
    timetable: entry.timetable,
    college: { attended: collegeAttended, held: collegeHeld, percentage: percentOf(collegeAttended, collegeHeld) },
  };

  if (current && sameCounts(countsOf(current), next) && sameNote(current, note)) {
    return res
      .status(200)
      .json(new ApiResponse(200, { adjustment: shape(current, subject), changed: false, ...result }, 'Already matches'));
  }

  let adjustment;
  try {
    if (!current) {
      adjustment = (await ExtraClassAdjustment.create({ ...filter, ...next, ...noteFields(note) })).toObject();
    } else {
      adjustment = await ExtraClassAdjustment.findOneAndUpdate(
        { _id: current._id, ...countsOf(current) },
        withNote({ $set: { ...next } }, note),
        { new: true }
      ).lean();
      if (!adjustment) throw conflictError();
    }
  } catch (err) {
    if (err?.code === 11000) throw conflictError();
    throw err;
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { adjustment: shape(adjustment, subject), changed: true, ...result },
        'Your attendance for this subject now matches the college record'
      )
    );
});

// ---------- Delete ----------

// Removes the record, so the subject's percentage goes back to timetable classes only.
// The removed counts and note are returned so the app can offer an undo (send them to PUT).
const deleteAdjustment = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);

  const removed = await ExtraClassAdjustment.findOneAndDelete({
    setupId: req.setup._id,
    subjectId: subject._id,
  }).lean();
  if (!removed) throw new ApiError(404, 'No extra classes recorded for this subject');

  return res
    .status(200)
    .json(new ApiResponse(200, { removed: shape(removed, subject) }, 'Extra classes removed'));
});

export {
  listAdjustments,
  getAdjustment,
  setAdjustment,
  changeAdjustment,
  matchRecord,
  deleteAdjustment,
};