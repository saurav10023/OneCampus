import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

const readBoolean = (value, name, errors) => {
  if (value === undefined) return false;
  if (value !== 'true' && value !== 'false') {
    errors.push(`${name} must be true or false`);
    return false;
  }
  return value === 'true';
};

// GET ?includeArchived=true
const validateOverviewQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const includeArchived = readBoolean(q.includeArchived, 'includeArchived', errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = { includeArchived };
  next();
};

// GET /bunk?count=2&subjectId=...&includeArchived=true
const validateBunkQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = {};

  const count = Number(q.count);
  if (q.count === undefined || !Number.isInteger(count) || count < 1 || count > 500) {
    errors.push('count must be a whole number from 1 to 500');
  } else out.count = count;

  if (q.subjectId !== undefined) {
    if (typeof q.subjectId !== 'string' || !mongoose.isValidObjectId(q.subjectId)) {
      errors.push('subjectId must be a valid id');
    } else out.subjectId = q.subjectId;
  }
  out.includeArchived = readBoolean(q.includeArchived, 'includeArchived', errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

export { validateOverviewQuery, validateBunkQuery };