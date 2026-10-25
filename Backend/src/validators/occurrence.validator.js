import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { ATTENDANCE_STATUS, CLASS_TYPE, TIME_REGEX, DAY_MS } from '../utils/constants.js';

// What a student may set. not_counted is system-only; cancelled here means "I cancelled it
// myself" (no cause). Anything else in the body (source, causeType, causeId, previousStatus,
// reason, setupId ...) is dropped and can never reach the controller.
const STUDENT_MARKS = Object.freeze([
  ATTENDANCE_STATUS.PRESENT,
  ATTENDANCE_STATUS.ABSENT,
  ATTENDANCE_STATUS.EXCUSED,
  ATTENDANCE_STATUS.CANCELLED,
  ATTENDANCE_STATUS.PENDING,
]);

const MAX_RANGE_DAYS = 93;
const MAX_BULK_IDS = 100;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
const spanDays = (from, to) => Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;

const readRange = (source, errors) => {
  const from = parseDateOnly(source.from);
  const to = parseDateOnly(source.to);
  if (!from) errors.push('from must be a valid date in YYYY-MM-DD format');
  if (!to) errors.push('to must be a valid date in YYYY-MM-DD format');
  if (from && to) {
    if (to < from) errors.push('to must be on or after from');
    else if (spanDays(from, to) > MAX_RANGE_DAYS) errors.push(`The range can be at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
};

const readSubjectId = (value, errors) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    errors.push('subjectId must be a valid id');
    return undefined;
  }
  return value;
};

// GET ?from=2026-09-07&to=2026-09-13&subjectId=&status=
const validateListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const { from, to } = readRange(q, errors);
  const subjectId = readSubjectId(q.subjectId, errors);

  let status;
  if (q.status !== undefined) {
    if (!Object.values(ATTENDANCE_STATUS).includes(q.status)) {
      errors.push(`status must be one of ${Object.values(ATTENDANCE_STATUS).join(', ')}`);
    } else status = q.status;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = { from, to, subjectId, status };
  next();
};

const readMark = (body, errors) => {
  let status;
  if (!STUDENT_MARKS.includes(body.status)) {
    errors.push(`status must be one of ${STUDENT_MARKS.join(', ')}`);
  } else status = body.status;

  let overrideCancellation = false;
  if (body.overrideCancellation !== undefined) {
    if (typeof body.overrideCancellation !== 'boolean') errors.push('overrideCancellation must be true or false');
    else overrideCancellation = body.overrideCancellation;
  }
  return { status, overrideCancellation };
};

// PATCH /occurrences/:occurrenceId/status   { "status": "present", "overrideCancellation": false }
const validateMarkBody = (req, _res, next) => {
  const errors = [];
  const mark = readMark(asObject(req.body), errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = mark;
  next();
};

// PATCH /occurrences/status
//   by ids:   { "occurrenceIds": [..], "status": "present" }
//   by range: { "from": "2026-09-07", "to": "2026-09-07", "subjectId": "...", "status": "present" }
const validateBulkMarkBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const mark = readMark(body, errors);
  const out = { ...mark };

  const hasIds = body.occurrenceIds !== undefined;
  const hasRange = body.from !== undefined || body.to !== undefined;

  if (hasIds === hasRange) {
    errors.push('Send either occurrenceIds, or from and to, but not both');
  } else if (hasIds) {
    const ids = body.occurrenceIds;
    if (!Array.isArray(ids) || !ids.length) errors.push('occurrenceIds must be a non-empty array');
    else if (ids.length > MAX_BULK_IDS) errors.push(`You can mark at most ${MAX_BULK_IDS} classes at a time`);
    else if (!ids.every((id) => typeof id === 'string' && mongoose.isValidObjectId(id))) errors.push('occurrenceIds must all be valid ids');
    else if (new Set(ids).size !== ids.length) errors.push('occurrenceIds must not repeat');
    else out.occurrenceIds = ids;
  } else {
    const { from, to } = readRange(body, errors);
    out.from = from;
    out.to = to;
    out.subjectId = readSubjectId(body.subjectId, errors);
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = out;
  next();
};

// DELETE /occurrences/status
//   by ids:   { "occurrenceIds": [..] }
//   by range: { "from": "2026-09-07", "to": "2026-09-13", "subjectId": "..." }
// Same selection as bulk mark, with no status or overrideCancellation: clearing sends a class
// back to pending, and a class held by a cause is skipped by the controller, never overridden.
const validateBulkClearBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const out = {};

  const hasIds = body.occurrenceIds !== undefined;
  const hasRange = body.from !== undefined || body.to !== undefined;

  if (hasIds === hasRange) {
    errors.push('Send either occurrenceIds, or from and to, but not both');
  } else if (hasIds) {
    const ids = body.occurrenceIds;
    if (!Array.isArray(ids) || !ids.length) errors.push('occurrenceIds must be a non-empty array');
    else if (ids.length > MAX_BULK_IDS) errors.push(`You can clear at most ${MAX_BULK_IDS} classes at a time`);
    else if (!ids.every((id) => typeof id === 'string' && mongoose.isValidObjectId(id))) errors.push('occurrenceIds must all be valid ids');
    else if (new Set(ids).size !== ids.length) errors.push('occurrenceIds must not repeat');
    else out.occurrenceIds = ids;
  } else {
    const { from, to } = readRange(body, errors);
    out.from = from;
    out.to = to;
    out.subjectId = readSubjectId(body.subjectId, errors);
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = out;
  next();
};

// ---------- One-off class, single-class edit, delete ----------

const CLASS_TYPES = Object.values(CLASS_TYPE);
const MAX_UNITS = 6;

const readTimeField = (value, name, errors) => {
  if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
    errors.push(`${name} must be a time like 09:30 (24-hour)`);
    return undefined;
  }
  return value;
};

const readUnitsField = (value, errors) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_UNITS) {
    errors.push(`attendanceUnits must be a whole number from 1 to ${MAX_UNITS}`);
    return undefined;
  }
  return value;
};

const readClassType = (value, errors) => {
  if (!CLASS_TYPES.includes(value)) {
    errors.push(`classType must be one of ${CLASS_TYPES.join(', ')}`);
    return undefined;
  }
  return value;
};

// "" and null both mean the whole section. Lower-cased to match the official schedule's groups.
const readGroup = (value, errors) => {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('group must be text or null');
    return undefined;
  }
  const text = value.trim().toLowerCase();
  if (text.length > 40) {
    errors.push('group can be at most 40 characters');
    return undefined;
  }
  return text || null;
};

// POST { subjectId, date, startTime, endTime, attendanceUnits?, classType?, group? }
const validateCreateClassBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (typeof body.subjectId !== 'string' || !mongoose.isValidObjectId(body.subjectId)) {
    errors.push('subjectId is required and must be a valid id');
  } else clean.subjectId = body.subjectId;

  const date = parseDateOnly(body.date);
  if (!date) errors.push('date is required and must be a valid date in YYYY-MM-DD format');
  else clean.date = date;

  clean.startTime = readTimeField(body.startTime, 'startTime', errors);
  clean.endTime = readTimeField(body.endTime, 'endTime', errors);
  if (clean.startTime && clean.endTime && clean.endTime <= clean.startTime) {
    errors.push('endTime must be later than startTime');
  }

  clean.attendanceUnits = body.attendanceUnits === undefined ? 1 : readUnitsField(body.attendanceUnits, errors);
  clean.classType = body.classType === undefined ? CLASS_TYPE.LECTURE : readClassType(body.classType, errors);
  clean.group = body.group === undefined ? null : readGroup(body.group, errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// PATCH { startTime?, endTime?, attendanceUnits?, classType?, group? }  (at least one)
// The date cannot be edited. source, sourceType, recurringRuleId, subjectId and the rest are dropped.
const validateEditClassBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.startTime !== undefined) clean.startTime = readTimeField(body.startTime, 'startTime', errors);
  if (body.endTime !== undefined) clean.endTime = readTimeField(body.endTime, 'endTime', errors);
  if (clean.startTime && clean.endTime && clean.endTime <= clean.startTime) {
    errors.push('endTime must be later than startTime');
  }
  if (body.attendanceUnits !== undefined) clean.attendanceUnits = readUnitsField(body.attendanceUnits, errors);
  if (body.classType !== undefined) clean.classType = readClassType(body.classType, errors);
  if (body.group !== undefined) clean.group = readGroup(body.group, errors);

  if (!errors.length && !Object.keys(clean).length) errors.push('No valid fields to update');
  if (errors.length) throw new ApiError(400, errors[0] === 'No valid fields to update' ? 'No valid fields to update' : 'Validation failed', errors);
  req.body = clean;
  next();
};

// DELETE { confirm?: true }
const validateDeleteClassBody = (req, _res, next) => {
  const body = asObject(req.body);
  if (body.confirm !== undefined && typeof body.confirm !== 'boolean') {
    throw new ApiError(400, 'Validation failed', ['confirm must be true or false']);
  }
  req.body = { confirm: body.confirm === true };
  next();
};

// ---------- Day and week views ----------

// GET /today?date=2026-10-22  (date is optional: the default is today in the setup's timezone)
const validateDayQuery = (req, _res, next) => {
  const q = asObject(req.query);
  let date = null;
  if (q.date !== undefined) {
    date = parseDateOnly(q.date);
    if (!date) throw new ApiError(400, 'Validation failed', ['date must be a valid date in YYYY-MM-DD format']);
  }
  req.validatedQuery = { date };
  next();
};

// GET /week?date=2026-10-22&weekStart=1  (weekStart: 0 = Sunday ... 6 = Saturday, default 1)
const validateWeekQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  let date = null;
  let weekStart = 1;

  if (q.date !== undefined) {
    date = parseDateOnly(q.date);
    if (!date) errors.push('date must be a valid date in YYYY-MM-DD format');
  }
  if (q.weekStart !== undefined) {
    weekStart = Number(q.weekStart);
    if (!Number.isInteger(weekStart) || weekStart < 0 || weekStart > 6) {
      errors.push('weekStart must be a whole number from 0 (Sunday) to 6 (Saturday)');
    }
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = { date, weekStart };
  next();
};

export {
  validateListQuery,
  validateMarkBody,
  validateBulkMarkBody,
  validateBulkClearBody,
  validateCreateClassBody,
  validateEditClassBody,
  validateDeleteClassBody,
  validateDayQuery,
  validateWeekQuery,
};