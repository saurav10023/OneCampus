import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { BRANCHES, SECTIONS, SCHEDULE_ROLE, SCHEDULE_ROLE_STATUS } from '../utils/constants.js';

const MAX_NOTE = 300;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// "cse" and " CSE " both become "CSE", so the check matches the model's enum
const readFrom = (value, allowed, name, errors) => {
  if (typeof value !== 'string') {
    errors.push(`${name} must be text`);
    return undefined;
  }
  const text = value.trim().toUpperCase();
  if (!allowed.includes(text)) {
    errors.push(`${name} must be one of ${allowed.join(', ')}`);
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

// POST /   { branch?, section?, note? }   (branch and section default to the student's own)
// Only a CR role can be requested. Anything else in the body is dropped.
const validateRequestRoleBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.role !== undefined && body.role !== SCHEDULE_ROLE.CR) {
    errors.push('Only a CR role can be requested');
  }
  if (body.branch !== undefined) clean.branch = readFrom(body.branch, BRANCHES, 'branch', errors);
  if (body.section !== undefined) clean.section = readFrom(body.section, SECTIONS, 'section', errors);
  const note = readNote(body.note, errors);
  if (note !== undefined) clean.note = note;

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// PATCH /:roleId/approve | reject | revoke   { note? }
const validateDecisionBody = (req, _res, next) => {
  const errors = [];
  const note = readNote(asObject(req.body).note, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = note === undefined ? {} : { note };
  next();
};

// GET /requests?status=pending&branch=CSE&section=A   (all optional)
const validateRequestsQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const clean = {};

  if (q.status !== undefined) {
    const statuses = Object.values(SCHEDULE_ROLE_STATUS);
    if (!statuses.includes(q.status)) errors.push(`status must be one of ${statuses.join(', ')}`);
    else clean.status = q.status;
  }
  if (q.branch !== undefined) clean.branch = readFrom(q.branch, BRANCHES, 'branch', errors);
  if (q.section !== undefined) clean.section = readFrom(q.section, SECTIONS, 'section', errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = clean;
  next();
};

const validateRoleIdParam = (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.roleId)) throw new ApiError(400, 'Invalid roleId');
  next();
};

export { validateRequestRoleBody, validateDecisionBody, validateRequestsQuery, validateRoleIdParam };