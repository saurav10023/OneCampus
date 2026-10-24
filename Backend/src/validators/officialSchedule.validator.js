import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import {
  ACADEMIC_YEAR_REGEX,
  BRANCHES,
  SECTIONS,
  SCHEDULE_STATUS,
  GROUP_KIND,
  MAX_SCHEDULE_GROUPS,
} from '../utils/constants.js';

const MAX_NOTE = 500;
const MAX_LABEL = 40;
const GROUP_KEY_REGEX = /^[a-z0-9_-]{1,20}$/;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// "cse" and " CSE " both become "CSE", so the check matches the model's enum
const readFrom = (value, allowed, name, errors) => {
  if (typeof value !== 'string') {
    errors.push(`${name} is required and must be text`);
    return undefined;
  }
  const text = value.trim().toUpperCase();
  if (!allowed.includes(text)) {
    errors.push(`${name} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return text;
};

// 2026-27: the second part must be the year after the first
const readAcademicYear = (value, errors) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!ACADEMIC_YEAR_REGEX.test(text)) {
    errors.push('academicYear is required and must look like 2026-27');
    return undefined;
  }
  const start = Number(text.slice(0, 4));
  if (Number(text.slice(5)) !== (start + 1) % 100) {
    errors.push('academicYear must cover two consecutive years, like 2026-27');
    return undefined;
  }
  return text;
};

const readSemesterLabel = (value, errors) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > MAX_LABEL) {
    errors.push(`semesterLabel is required and can be at most ${MAX_LABEL} characters`);
    return undefined;
  }
  return text;
};

const readNote = (value, errors) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    errors.push('note must be text');
    return undefined;
  }
  const text = value.trim();
  if (text.length > MAX_NOTE) {
    errors.push(`note can be at most ${MAX_NOTE} characters`);
    return undefined;
  }
  return text;
};

// [{ key, label, kind? }]. Keys are lowercased, so "Lab-A" and "lab-a" are the same group.
const readGroups = (value, errors) => {
  if (!Array.isArray(value)) {
    errors.push('groups must be an array');
    return undefined;
  }
  if (value.length > MAX_SCHEDULE_GROUPS) {
    errors.push(`A schedule can have at most ${MAX_SCHEDULE_GROUPS} groups`);
    return undefined;
  }

  const kinds = Object.values(GROUP_KIND);
  const groups = [];
  const seen = new Set();
  let ok = true;

  value.forEach((raw, index) => {
    const g = asObject(raw);
    const key = typeof g.key === 'string' ? g.key.trim().toLowerCase() : '';
    const label = typeof g.label === 'string' ? g.label.trim() : '';
    const where = `groups[${index}]`;

    if (!GROUP_KEY_REGEX.test(key)) {
      errors.push(`${where}.key must be 1 to 20 letters, numbers, dashes or underscores`);
      ok = false;
    } else if (seen.has(key)) {
      errors.push(`${where}.key "${key}" is used twice`);
      ok = false;
    }
    seen.add(key);

    if (!label || label.length > MAX_LABEL) {
      errors.push(`${where}.label is required and can be at most ${MAX_LABEL} characters`);
      ok = false;
    }
    if (g.kind !== undefined && !kinds.includes(g.kind)) {
      errors.push(`${where}.kind must be one of ${kinds.join(', ')}`);
      ok = false;
    }
    groups.push({ key, label, ...(g.kind !== undefined ? { kind: g.kind } : {}) });
  });

  return ok ? groups : undefined;
};

// Both dates or neither. null clears a date when allowNull is true (update only).
const readSemesterDates = (body, errors, { allowNull }) => {
  const hasStart = body.semesterStart !== undefined;
  const hasEnd = body.semesterEnd !== undefined;
  if (!hasStart && !hasEnd) return undefined;
  if (hasStart !== hasEnd) {
    errors.push('semesterStart and semesterEnd must be given together');
    return undefined;
  }
  if (allowNull && body.semesterStart === null && body.semesterEnd === null) {
    return { semesterStart: null, semesterEnd: null };
  }

  const start = parseDateOnly(body.semesterStart);
  const end = parseDateOnly(body.semesterEnd);
  if (!start) errors.push('semesterStart must be a valid date in YYYY-MM-DD format');
  if (!end) errors.push('semesterEnd must be a valid date in YYYY-MM-DD format');
  if (start && end && end < start) errors.push('semesterEnd must be on or after semesterStart');
  return start && end ? { semesterStart: start, semesterEnd: end } : undefined;
};

// POST /   { academicYear, semesterLabel, branch, section, semesterStart?, semesterEnd?, groups? }
// status, createdBy, contentRevision and every other field are dropped.
const validateCreateScheduleBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {
    academicYear: readAcademicYear(body.academicYear, errors),
    semesterLabel: readSemesterLabel(body.semesterLabel, errors),
    branch: readFrom(body.branch, BRANCHES, 'branch', errors),
    section: readFrom(body.section, SECTIONS, 'section', errors),
  };

  Object.assign(clean, readSemesterDates(body, errors, { allowNull: false }));
  if (body.groups !== undefined) clean.groups = readGroups(body.groups, errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// PATCH /:scheduleId   { groups?, semesterStart?, semesterEnd?, note? }  (at least one)
// The college, year, semester, branch and section cannot be edited: archive and create a new one.
const validateUpdateScheduleBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.groups !== undefined) clean.groups = readGroups(body.groups, errors);
  Object.assign(clean, readSemesterDates(body, errors, { allowNull: true }));
  const note = readNote(body.note, errors);

  if (!errors.length && clean.groups === undefined && clean.semesterStart === undefined) {
    errors.push('No valid fields to update');
  }
  if (errors.length) throw new ApiError(400, errors[0] === 'No valid fields to update' ? errors[0] : 'Validation failed', errors);
  if (note !== undefined) clean.note = note;
  req.body = clean;
  next();
};

// POST /:scheduleId/publish | unpublish | archive   { note? }
const validateNoteBody = (req, _res, next) => {
  const errors = [];
  const note = readNote(asObject(req.body).note, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = note === undefined ? {} : { note };
  next();
};

// GET /?status=draft&branch=CSE&section=A   (all optional)
const validateScheduleListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const clean = {};

  if (q.status !== undefined) {
    const statuses = Object.values(SCHEDULE_STATUS);
    if (!statuses.includes(q.status)) errors.push(`status must be one of ${statuses.join(', ')}`);
    else clean.status = q.status;
  }
  if (q.branch !== undefined) clean.branch = readFrom(q.branch, BRANCHES, 'branch', errors);
  if (q.section !== undefined) clean.section = readFrom(q.section, SECTIONS, 'section', errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = clean;
  next();
};

const validateScheduleIdParam = (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.scheduleId)) throw new ApiError(400, 'Invalid scheduleId');
  next();
};

export {
  validateCreateScheduleBody,
  validateUpdateScheduleBody,
  validateNoteBody,
  validateScheduleListQuery,
  validateScheduleIdParam,
};