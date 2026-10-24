import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';

const MAX_GROUPS = 20;
const MAX_GROUP_LENGTH = 20;
const MAX_SUBJECT_CHOICES = 50;
const MAX_KEY = 64;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// Whitelist: only these fields reach the service. The student never sends a scope, a revision or
// anything about the schedule's content: the schedule decides all of that.

const readScheduleId = (value, errors) => {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    errors.push('scheduleId is required and must be a valid id');
    return undefined;
  }
  return value;
};

// ["b1", "b2"]: group keys from the schedule. Lower-cased, trimmed, no repeats.
const readGroups = (value, errors) => {
  if (!Array.isArray(value)) {
    errors.push('groups must be a list of group keys');
    return undefined;
  }
  if (value.length > MAX_GROUPS) {
    errors.push(`groups can have at most ${MAX_GROUPS} entries`);
    return undefined;
  }
  const out = [];
  for (const g of value) {
    if (typeof g !== 'string' || !g.trim() || g.trim().length > MAX_GROUP_LENGTH) {
      errors.push('every group must be a non-empty key of up to 20 characters');
      return undefined;
    }
    const key = g.trim().toLowerCase();
    if (!out.includes(key)) out.push(key);
  }
  return out;
};

// [{ "key": "<official subject key>", "studentSubjectId": "<your subject id>" | null }]
// null means "add this official subject as a new one".
const readSubjectMap = (value, errors) => {
  if (!Array.isArray(value)) {
    errors.push('subjectMap must be a list');
    return undefined;
  }
  if (value.length > MAX_SUBJECT_CHOICES) {
    errors.push(`subjectMap can have at most ${MAX_SUBJECT_CHOICES} entries`);
    return undefined;
  }
  const out = [];
  value.forEach((entry, i) => {
    const e = asObject(entry);
    const key = typeof e.key === 'string' ? e.key.trim() : '';
    if (!key || key.length > MAX_KEY) {
      errors.push(`subjectMap[${i}].key must be the key of an official subject`);
      return;
    }
    if (e.studentSubjectId === null) {
      out.push({ key, studentSubjectId: null });
    } else if (typeof e.studentSubjectId === 'string' && mongoose.isValidObjectId(e.studentSubjectId)) {
      out.push({ key, studentSubjectId: e.studentSubjectId });
    } else {
      errors.push(`subjectMap[${i}].studentSubjectId must be one of your subject ids, or null`);
    }
  });
  return out;
};

const readChoices = (body, clean, errors) => {
  clean.scheduleId = readScheduleId(body.scheduleId, errors);
  if (body.groups !== undefined) clean.groups = readGroups(body.groups, errors);
  if (body.subjectMap !== undefined) clean.subjectMap = readSubjectMap(body.subjectMap, errors);
};

const finish = (req, next, clean, errors) => {
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// POST /join-preview  { scheduleId, groups?, subjectMap? }
const validateJoinPreviewBody = (req, _res, next) => {
  const errors = [];
  const clean = {};
  readChoices(asObject(req.body), clean, errors);
  finish(req, next, clean, errors);
};

// POST /join  { scheduleId, groups?, subjectMap?, confirm: true }
const validateJoinBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};
  readChoices(body, clean, errors);
  if (body.confirm !== true) {
    errors.push('confirm must be true: joining cancels and locks the classes the schedule cancels');
  }
  finish(req, next, clean, errors);
};

// POST /leave  { confirm: true }
const validateLeaveBody = (req, _res, next) => {
  if (asObject(req.body).confirm !== true) {
    throw new ApiError(400, 'Validation failed', ['confirm must be true: leaving makes the official events and cancellations your own']);
  }
  req.body = { confirm: true };
  next();
};

export { validateJoinPreviewBody, validateJoinBody, validateLeaveBody };