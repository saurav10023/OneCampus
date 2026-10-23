import ApiError from '../utils/ApiError.js';
import Subject from '../models/TimeTable/subject.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import { applyCancellation } from './cancellation.service.js';
import { ATTENDANCE_STATUS, CAUSE_TYPE } from '../utils/constants.js';
import { toDateText, timesOverlap } from '../utils/dateWindow.js';
import asyncHandler from '../utils/asyncHandler.js';

const ONE_OFF = 'manual_import';
const RULE_BASED = 'recurring_rule';

// input (already cleaned by the validator):
//   { subjectId, date, startTime, endTime, attendanceUnits, classType, group }
const createOneOffClass = async ({ setup, userId, input }) => {
  const subject = await Subject.findOne({ _id: input.subjectId, setupId: setup._id })
    .select('name isActive')
    .lean();
  if (!subject) throw new ApiError(400, 'Subject not found in this setup');
  if (subject.isActive === false) {
    throw new ApiError(409, 'This subject is archived. Restore it before adding classes to it.');
  }

  if (input.date < setup.startDate || input.date > setup.endDate) {
    throw new ApiError(
      400,
      `The date must fall inside your setup (${toDateText(setup.startDate)} to ${toDateText(setup.endDate)})`
    );
  }

  const occurrence = new Occurrence({
    setupId: setup._id,
    recurringRuleId: null,
    subjectId: subject._id,
    date: input.date,
    plannedStartTime: input.startTime,
    plannedEndTime: input.endTime,
    attendanceUnits: input.attendanceUnits,
    classType: input.classType,
    group: input.group,
    sourceType: ONE_OFF,
    isCustomized: false,
  });

  try {
    await occurrence.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'This subject already has a class starting at that time on that date');
    }
    throw err;
  }

  const warnings = [];

  // Same-day clashes are a warning only. Two different named groups never clash.
  const sameDay = await Occurrence.find({
    setupId: setup._id,
    date: input.date,
    _id: { $ne: occurrence._id },
  })
    .select('plannedStartTime plannedEndTime group')
    .lean();
  const clashes = sameDay.filter(
    (o) =>
      timesOverlap(input.startTime, input.endTime, o.plannedStartTime, o.plannedEndTime) &&
      !(o.group && input.group && o.group !== input.group)
  );
  if (clashes.length) {
    warnings.push(`This class overlaps with ${clashes.length} other class(es) on the same day.`);
  }

  // A confirmed holiday, break or exam on that date takes the class
  let cancelledByEvents = 0;
  try {
    const events = await CalendarEvent.find({
      setupId: setup._id,
      confirmedAt: { $ne: null },
      affectsClasses: true,
      startDate: { $lte: input.date },
      endDate: { $gte: input.date },
    })
      .sort({ startDate: 1, _id: 1 })
      .select('_id')
      .lean();

    for (const event of events) {
      const result = await applyCancellation({
        setupId: setup._id,
        userId,
        filter: { from: input.date, to: input.date, occurrenceIds: [occurrence._id] },
        cause: { type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id },
      });
      cancelledByEvents += result.cancelled;
    }
  } catch (err) {
    // Leave nothing half-done, so the request can simply be sent again
    await OccurrenceStatus.deleteMany({ occurrenceId: occurrence._id });
    await Occurrence.deleteOne({ _id: occurrence._id });
    throw err;
  }
  if (cancelledByEvents) {
    warnings.push('This date is a holiday, break or exam in your calendar, so the class was marked "Cancelled".');
  }

  return { occurrence: occurrence.toObject(), cancelledByEvents, warnings };
};

// Changes the details of one class: startTime, endTime, attendanceUnits, classType, group.
// The date cannot be changed here.
const EDITABLE = ['startTime', 'endTime', 'attendanceUnits', 'classType', 'group'];
const FIELD_NAME = { startTime: 'plannedStartTime', endTime: 'plannedEndTime' };

const editOccurrenceDetails = async ({ setup, userId, occurrenceId, input }) => {
  const occurrence = await Occurrence.findOne({ _id: occurrenceId, setupId: setup._id });
  if (!occurrence) throw new ApiError(404, 'Class not found');

  for (const field of EDITABLE) {
    if (input[field] !== undefined) occurrence.set(FIELD_NAME[field] ?? field, input[field]);
  }
  if (occurrence.plannedEndTime <= occurrence.plannedStartTime) {
    throw new ApiError(400, 'endTime must be later than startTime');
  }
  if (!occurrence.isModified()) {
    return { occurrence: occurrence.toObject(), changed: false, warnings: [] };
  }

  const warnings = [];
  if (occurrence.sourceType === RULE_BASED) {
    occurrence.isCustomized = true;
    warnings.push('This class was changed on its own. Later edits to its weekly class will not overwrite it.');
  }
  if (occurrence.isModified('attendanceUnits')) {
    const row = await OccurrenceStatus.findOne({ occurrenceId: occurrence._id, userId })
      .select('status')
      .lean();
    if (row && [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT].includes(row.status)) {
      warnings.push('This class already counts in your attendance, so your percentage will change.');
    }
  }

  try {
    await occurrence.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, 'This subject already has a class starting at that time on that date');
    }
    throw err;
  }
  return { occurrence: occurrence.toObject(), changed: true, warnings };
};

// Only one-off classes can be deleted. Marks the student made need an explicit yes.
const deleteOneOffClass = async ({ setup, userId, occurrenceId, confirm }) => {
  const occurrence = await Occurrence.findOne({ _id: occurrenceId, setupId: setup._id })
    .select('sourceType')
    .lean();
  if (!occurrence) throw new ApiError(404, 'Class not found');
  if (occurrence.sourceType !== ONE_OFF) {
    throw new ApiError(409, 'Only one-off classes can be deleted', [
      'To skip this class, mark it cancelled.',
      'To stop a weekly class, switch its weekly rule off.',
    ]);
  }

  const rows = await OccurrenceStatus.find({ occurrenceId, userId })
    .select('status causeType previousStatus')
    .lean();
  // A row that only records a holiday cancelling the class holds nothing the student did
  const recorded = rows.some(
    (r) => !(r.causeType && r.previousStatus == null) && r.status !== ATTENDANCE_STATUS.PENDING
  );
  if (recorded && confirm !== true) {
    throw new ApiError(409, 'This class has attendance recorded. Deleting it removes that.', [
      'Send confirm: true to delete it.',
    ]);
  }

  // Status rows first, so a crash never leaves a row pointing at a deleted class
  await OccurrenceStatus.deleteMany({ occurrenceId });
  await Occurrence.deleteOne({ _id: occurrenceId });
  return { deleted: true, hadRecordedAttendance: recorded };
};

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
export { createOneOffClass, editOccurrenceDetails, deleteOneOffClass ,createClass , editClass , getDay , getWeek , deleteClass , countByStatus , eventFields};