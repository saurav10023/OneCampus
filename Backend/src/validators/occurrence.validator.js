import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { ATTENDANCE_STATUS, DAY_MS } from '../utils/constants.js';

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

export { validateListQuery, validateMarkBody, validateBulkMarkBody };