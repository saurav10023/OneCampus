import ApiError from '../utils/ApiError.js';
import {
  MAX_COUNT,
  MAX_NOTE,
  MAX_COLLEGE_COUNT,
  checkCounts,
} from '../utils/extraClassMath.js';

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
const isWhole = (v) => typeof v === 'number' && Number.isInteger(v);

// undefined = leave it, null or blank = remove it, text = set it
const readNote = (value, errors) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('note must be text or null');
    return undefined;
  }
  const text = value.trim();
  if (text.length > MAX_NOTE) {
    errors.push(`note can be at most ${MAX_NOTE} characters`);
    return undefined;
  }
  return text || null;
};

// Whitelist: setupId, subjectId and everything else can never come from the body.
// PUT { "totalCount": 5, "attendedCount": 2, "missedCount": 1, "note": "..." }
// attendedCount and missedCount default to 0.
const validateSetBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];

  if (!isWhole(body.totalCount)) errors.push('totalCount is required and must be a whole number');
  for (const name of ['attendedCount', 'missedCount']) {
    if (body[name] !== undefined && !isWhole(body[name])) errors.push(`${name} must be a whole number`);
  }
  const note = readNote(body.note, errors);

  const clean = {
    totalCount: body.totalCount,
    attendedCount: body.attendedCount ?? 0,
    missedCount: body.missedCount ?? 0,
  };
  if (!errors.length) errors.push(...checkCounts(clean));

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (note !== undefined) clean.note = note;
  req.body = clean;
  next();
};

// PATCH { "attended": 1, "unrecorded": -1, "expected": { totalCount, attendedCount, missedCount }, "note": "..." }
// attended, missed and unrecorded are changes, not new totals.
// expected (optional) is what the app last saw. The change is refused if the counts moved since,
// which is what makes a retry after a lost connection safe.
const validateChangeBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  for (const name of ['attended', 'missed', 'unrecorded']) {
    const value = body[name];
    if (value === undefined) continue;
    if (!isWhole(value) || value < -MAX_COUNT || value > MAX_COUNT) {
      errors.push(`${name} must be a whole number from -${MAX_COUNT} to ${MAX_COUNT}`);
    } else clean[name] = value;
  }

  if (body.expected !== undefined) {
    const e = asObject(body.expected);
    if (!isWhole(e.totalCount) || !isWhole(e.attendedCount) || !isWhole(e.missedCount)) {
      errors.push('expected must have totalCount, attendedCount and missedCount as whole numbers');
    } else {
      clean.expected = {
        totalCount: e.totalCount,
        attendedCount: e.attendedCount,
        missedCount: e.missedCount,
      };
    }
  }

  const note = readNote(body.note, errors);
  if (note !== undefined) clean.note = note;

  if (!errors.length) {
    const hasDelta = ['attended', 'missed', 'unrecorded'].some((k) => clean[k] !== undefined);
    const allZero = ['attended', 'missed', 'unrecorded'].every((k) => !clean[k]);
    if (!hasDelta && note === undefined) errors.push('Send at least one of attended, missed, unrecorded, note');
    else if (hasDelta && allZero && note === undefined) errors.push('Nothing to change');
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// POST /match { "collegeAttended": 31, "collegeHeld": 40, "note": "..." }
const validateMatchBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];

  for (const name of ['collegeAttended', 'collegeHeld']) {
    const value = body[name];
    if (!isWhole(value) || value < 0 || value > MAX_COLLEGE_COUNT) {
      errors.push(`${name} is required and must be a whole number from 0 to ${MAX_COLLEGE_COUNT}`);
    }
  }
  if (!errors.length && body.collegeAttended > body.collegeHeld) {
    errors.push('collegeAttended cannot be more than collegeHeld');
  }
  const note = readNote(body.note, errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  const clean = { collegeAttended: body.collegeAttended, collegeHeld: body.collegeHeld };
  if (note !== undefined) clean.note = note;
  req.body = clean;
  next();
};

export { validateSetBody, validateChangeBody, validateMatchBody };