import ApiError from '../utils/ApiError.js';
import { toNameKey } from '../models/TimeTable/subject.model.js';
import mongoose from 'mongoose';
const CODE_REGEX = /^[A-Z0-9][A-Z0-9 ._/-]{0,19}$/;
const COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_BULK = 20;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// Whitelist: nameKey, setupId, origin, officialKey, isActive and the other official fields can
// never come from a client. isActive has its own archive and restore endpoints.
const cleanSubject = (raw, { partial }, errors, prefix = '') => {
  const body = asObject(raw);
  const clean = {};
  const err = (message) => errors.push(`${prefix}${message}`);

  if (body.name === undefined) {
    if (!partial) err('name is required');
  } else if (typeof body.name !== 'string' || !body.name.trim()) {
    err('name must be a non-empty string');
  } else if (body.name.trim().length > 100) {
    err('name can be at most 100 characters');
  } else {
    clean.name = body.name.trim();
  }

  // null or "" removes the code
  if (body.code !== undefined) {
    if (body.code === null) {
      clean.code = null;
    } else if (typeof body.code !== 'string') {
      err('code must be a string or null');
    } else {
      const code = body.code.trim().toUpperCase();
      if (code && !CODE_REGEX.test(code)) {
        err('code can have up to 20 letters, numbers, spaces, dots, dashes, slashes or underscores');
      } else {
        clean.code = code || null;
      }
    }
  }

  // null means "use the setup's target"
  if (body.targetPercentage !== undefined) {
    const v = body.targetPercentage;
    if (v === null) clean.targetPercentage = null;
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      err('targetPercentage must be a number from 0 to 100, or null');
    } else clean.targetPercentage = v;
  }

  if (body.color !== undefined) {
    if (body.color === null) clean.color = null;
    else if (typeof body.color !== 'string' || !COLOR_REGEX.test(body.color)) {
      err('color must look like #1A2B3C, or null');
    } else clean.color = body.color;
  }

  if (body.credits !== undefined) {
    const v = body.credits;
    if (v === null) clean.credits = null;
    else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 30) {
      err('credits must be a number from 0 to 30, or null');
    } else clean.credits = v;
  }

  return clean;
};

const validateCreateSubject = (req, _res, next) => {
  const errors = [];
  const clean = cleanSubject(req.body, { partial: false }, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

const validateUpdateSubject = (req, _res, next) => {
  const errors = [];
  const clean = cleanSubject(req.body, { partial: true }, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (!Object.keys(clean).length) throw new ApiError(400, 'No valid fields to update');
  req.body = clean;
  next();
};

// Body: { "subjects": [ {...}, {...} ] }. Also catches duplicates inside the request itself.
// const validateBulkCreateSubjects = (req, _res, next) => {
//   const list = req.body?.subjects;
//   if (!Array.isArray(list) || !list.length) {
//     throw new ApiError(400, 'subjects must be a non-empty array');
//   }
//   if (list.length > MAX_BULK) {
//     throw new ApiError(400, `You can add at most ${MAX_BULK} subjects at a time`);
//   }

//   const errors = [];
//   const cleaned = list.map((item, i) => cleanSubject(item, { partial: false }, errors, `subjects[${i}]: `));

//   const seenNames = new Map();
//   const seenCodes = new Map();
//   cleaned.forEach((s, i) => {
//     if (s.name) {
//       const key = toNameKey(s.name);
//       if (seenNames.has(key)) errors.push(`subjects[${i}]: name repeats subjects[${seenNames.get(key)}]`);
//       else seenNames.set(key, i);
//     }
//     if (s.code) {
//       if (seenCodes.has(s.code)) errors.push(`subjects[${i}]: code repeats subjects[${seenCodes.get(s.code)}]`);
//       else seenCodes.set(s.code, i);
//     }
//   });

//   if (errors.length) throw new ApiError(400, 'Validation failed', errors);
//   req.body = { subjects: cleaned };
//   next();
// };

const validateBulkCreateSubjects = (req, _res, next) => {
  const list = req.body?.subjects;
  if (!Array.isArray(list) || !list.length) {
    throw new ApiError(400, 'subjects must be a non-empty array');
  }
  if (list.length > MAX_BULK) {
    throw new ApiError(400, `You can add at most ${MAX_BULK} subjects at a time`);
  }

  const errors = [];
  const cleaned = list.map((item, i) => cleanSubject(item, { partial: false }, errors, `subjects[${i}]: `));

  const seenNames = new Map();
  const seenCodes = new Map();
  cleaned.forEach((s, i) => {
    if (s.name) {
      const key = toNameKey(s.name);
      if (seenNames.has(key)) errors.push(`subjects[${i}]: name repeats subjects[${seenNames.get(key)}]`);
      else seenNames.set(key, i);
    }
    if (s.code) {
      if (seenCodes.has(s.code)) errors.push(`subjects[${i}]: code repeats subjects[${seenCodes.get(s.code)}]`);
      else seenCodes.set(s.code, i);
    }
  });

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = { subjects: cleaned };
  next();
};

// Query validators write to req.validatedQuery (req.query is read-only in newer Express)
const validateListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = { page: 1, limit: 20, sort: 'name', search: '', origin: null, isActive: null };

  if (q.page !== undefined) {
    const n = Number(q.page);
    if (!Number.isInteger(n) || n < 1) errors.push('page must be a whole number from 1');
    else out.page = n;
  }
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) errors.push('limit must be a whole number from 1 to 100');
    else out.limit = n;
  }
  if (q.sort !== undefined) {
    if (!['name', '-name', 'createdAt', '-createdAt', 'code', '-code'].includes(q.sort)) {
      errors.push('sort must be one of name, -name, createdAt, -createdAt, code, -code');
    } else out.sort = q.sort;
  }
  if (q.search !== undefined) {
    if (typeof q.search !== 'string' || q.search.length > 100) errors.push('search must be text of up to 100 characters');
    else out.search = q.search.trim();
  }
  if (q.origin !== undefined) {
    if (!['manual', 'official', 'shared_copy'].includes(q.origin)) errors.push('origin must be manual, official or shared_copy');
    else out.origin = q.origin;
  }
  if (q.isActive !== undefined) {
    if (!['true', 'false'].includes(q.isActive)) errors.push('isActive must be true or false');
    else out.isActive = q.isActive === 'true';
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

// GET /check?name=...&code=...&excludeId=...
const validateCheckQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = {};

  if (q.name !== undefined) {
    if (typeof q.name !== 'string' || !q.name.trim() || q.name.length > 100) errors.push('name must be text of up to 100 characters');
    else out.name = q.name.trim();
  }
  if (q.code !== undefined) {
    const code = typeof q.code === 'string' ? q.code.trim().toUpperCase() : '';
    if (!CODE_REGEX.test(code)) errors.push('code is not valid');
    else out.code = code;
  }
  if (q.excludeId !== undefined) out.excludeId = String(q.excludeId);
  if (out.name === undefined && out.code === undefined) errors.push('Send name or code to check');

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

const PREFER = ['target', 'source'];

// GET /:subjectId/merge-preview?into=<subjectId>&prefer=target
const validateMergeQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = { prefer: 'target' };

  if (typeof q.into !== 'string' || !mongoose.isValidObjectId(q.into)) {
    errors.push('into is required and must be a valid subject id');
  } else out.into = q.into;
  if (q.prefer !== undefined) {
    if (!PREFER.includes(q.prefer)) errors.push('prefer must be target or source');
    else out.prefer = q.prefer;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

// POST /:subjectId/merge { "into": "<subjectId>", "prefer": "target", "confirm": true }
// prefer: when both subjects have a different mark for the same class, whose mark is kept
const validateMergeBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const out = { prefer: 'target' };

  if (typeof body.into !== 'string' || !mongoose.isValidObjectId(body.into)) {
    errors.push('into is required and must be a valid subject id');
  } else out.into = body.into;
  if (body.prefer !== undefined) {
    if (!PREFER.includes(body.prefer)) errors.push('prefer must be target or source');
    else out.prefer = body.prefer;
  }
  if (body.confirm !== true) errors.push('confirm must be true: merging removes the first subject');

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = out;
  next();
};

export {
  validateCreateSubject,
  validateUpdateSubject,
  validateBulkCreateSubjects,
  validateListQuery,
  validateCheckQuery,
  validateMergeBody ,
  validateMergeQuery
};