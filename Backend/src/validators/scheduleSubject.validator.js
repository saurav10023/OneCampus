import ApiError from '../utils/ApiError.js';

const CODE_REGEX = /^[A-Z0-9][A-Z0-9 ._/-]{0,19}$/;
const MAX_NAME = 100;
const MAX_NOTE = 500;
const STATUS_FILTERS = ['active', 'withdrawn', 'all'];

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// Whitelist: scheduleId, key, nameKey, status, revision and everything else can never come from
// the request. `note` is the reason the CR gives, shown in the change history.

const readName = (value, errors) => {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push('name must be a non-empty string');
    return undefined;
  }
  if (value.trim().length > MAX_NAME) {
    errors.push(`name can be at most ${MAX_NAME} characters`);
    return undefined;
  }
  return value.trim();
};

// null or blank means "no code". Returns undefined only after pushing an error.
const readCode = (value, errors) => {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('code must be a string or null');
    return undefined;
  }
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (!CODE_REGEX.test(code)) {
    errors.push('code can have up to 20 letters, numbers, spaces, dots, dashes, slashes or underscores');
    return undefined;
  }
  return code;
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
  return text || undefined;
};

const finish = (req, next, clean, errors) => {
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// POST { name, code?, note? }
const validateCreateSubject = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.name === undefined) errors.push('name is required');
  else clean.name = readName(body.name, errors);
  if (body.code !== undefined) clean.code = readCode(body.code, errors);
  const note = readNote(body.note, errors);
  if (note !== undefined) clean.note = note;

  finish(req, next, clean, errors);
};

// PATCH { name?, code?, note? }  (code null or blank removes it)
const validateUpdateSubject = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.name !== undefined) clean.name = readName(body.name, errors);
  if (body.code !== undefined) clean.code = readCode(body.code, errors);
  const note = readNote(body.note, errors);

  if (!errors.length && clean.name === undefined && clean.code === undefined) {
    throw new ApiError(400, 'No valid fields to update');
  }
  if (note !== undefined) clean.note = note;
  finish(req, next, clean, errors);
};

// POST /withdraw and /restore  { note? }
const validateNoteBody = (req, _res, next) => {
  const errors = [];
  const clean = {};
  const note = readNote(asObject(req.body).note, errors);
  if (note !== undefined) clean.note = note;
  finish(req, next, clean, errors);
};

// GET ?status=active|withdrawn|all  (default active)
const validateSubjectListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  if (q.status !== undefined && !STATUS_FILTERS.includes(q.status)) {
    throw new ApiError(400, 'Validation failed', [`status must be one of ${STATUS_FILTERS.join(', ')}`]);
  }
  req.validatedQuery = { status: q.status ?? 'active' };
  next();
};

export { validateCreateSubject, validateUpdateSubject, validateNoteBody, validateSubjectListQuery };