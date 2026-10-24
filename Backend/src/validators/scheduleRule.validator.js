import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { CLASS_TYPE, ENTRY_TYPE, TIME_REGEX } from '../utils/constants.js';

const CLASS_TYPES = Object.values(CLASS_TYPE);
const ENTRY_TYPES = Object.values(ENTRY_TYPE);
const STATUS_FILTERS = ['active', 'withdrawn', 'all'];
const MAX_KEY = 64;
const MAX_GROUP = 20;
const MAX_ROOM = 40;
const MAX_PROFESSOR = 80;
const MAX_NOTE = 500;
const MAX_UNITS = 6;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// Whitelist: scheduleId, status, revision, entryType (after create) and everything else can never
// come from the request. For a makeup class the date arrives as `date`, and the weekday is read
// from it. `confirmOverlap` accepts a clash the CR has seen. `note` is the reason shown in history.

const readSubjectKey = (value, errors) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > MAX_KEY) {
    errors.push(`subjectKey must be the key of a subject in this schedule`);
    return undefined;
  }
  return value.trim();
};

const readWeekday = (value, errors) => {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    errors.push('weekday must be a whole number from 0 (Sunday) to 6 (Saturday)');
    return undefined;
  }
  return value;
};

const readTime = (value, name, errors) => {
  if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
    errors.push(`${name} must be a time like 09:30 (24-hour)`);
    return undefined;
  }
  return value;
};

const readDate = (value, name, errors) => {
  const date = parseDateOnly(value);
  if (!date) {
    errors.push(`${name} must be a valid date in YYYY-MM-DD format`);
    return undefined;
  }
  return date;
};

// null clears it (only used where clearing makes sense)
const readClearableDate = (value, name, errors) => (value === null ? null : readDate(value, name, errors));

const readClassType = (value, errors) => {
  if (!CLASS_TYPES.includes(value)) {
    errors.push(`classType must be one of ${CLASS_TYPES.join(', ')}`);
    return undefined;
  }
  return value;
};

// null or blank means the whole section
const readGroup = (value, errors) => {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('group must be text or null');
    return undefined;
  }
  const text = value.trim().toLowerCase();
  if (text.length > MAX_GROUP) {
    errors.push(`group can be at most ${MAX_GROUP} characters`);
    return undefined;
  }
  return text || null;
};

const readText = (value, name, max, errors) => {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push(`${name} must be text or null`);
    return undefined;
  }
  const text = value.trim();
  if (text.length > max) {
    errors.push(`${name} can be at most ${max} characters`);
    return undefined;
  }
  return text || null;
};

const readUnits = (value, errors) => {
  if (!Number.isInteger(value) || value < 1 || value > MAX_UNITS) {
    errors.push(`attendanceUnits must be a whole number from 1 to ${MAX_UNITS}`);
    return undefined;
  }
  return value;
};

const readBoolean = (value, name, errors) => {
  if (typeof value !== 'boolean') {
    errors.push(`${name} must be true or false`);
    return undefined;
  }
  return value;
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

const checkOrder = (clean, errors) => {
  if (clean.startTime && clean.endTime && clean.endTime <= clean.startTime) {
    errors.push('endTime must be later than startTime');
  }
  if (clean.effectiveStartDate && clean.effectiveEndDate && clean.effectiveEndDate < clean.effectiveStartDate) {
    errors.push('effectiveEndDate must not precede effectiveStartDate');
  }
};

const finish = (req, next, clean, errors) => {
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// The optional fields shared by create and update. `sent` says whether a field was in the request.
const readCommon = (body, clean, errors) => {
  if (body.classType !== undefined) clean.classType = readClassType(body.classType, errors);
  if (body.group !== undefined) clean.group = readGroup(body.group, errors);
  if (body.room !== undefined) clean.room = readText(body.room, 'room', MAX_ROOM, errors);
  if (body.professor !== undefined) clean.professor = readText(body.professor, 'professor', MAX_PROFESSOR, errors);
  if (body.attendanceUnits !== undefined) clean.attendanceUnits = readUnits(body.attendanceUnits, errors);
  if (body.confirmOverlap !== undefined) clean.confirmOverlap = readBoolean(body.confirmOverlap, 'confirmOverlap', errors);
  const note = readNote(body.note, errors);
  if (note !== undefined) clean.note = note;
};

// POST weekly:  { subjectKey, weekday, startTime, endTime, effectiveStartDate?, effectiveEndDate?, ... }
// POST makeup:  { subjectKey, entryType: "makeup", date, startTime, endTime, group?, ... }
const validateCreateRule = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};
  const sent = (k) => body[k] !== undefined && body[k] !== null;

  if (!sent('subjectKey')) errors.push('subjectKey is required');
  else clean.subjectKey = readSubjectKey(body.subjectKey, errors);

  let entryType = ENTRY_TYPE.WEEKLY;
  if (body.entryType !== undefined) {
    if (!ENTRY_TYPES.includes(body.entryType)) errors.push(`entryType must be one of ${ENTRY_TYPES.join(', ')}`);
    else entryType = body.entryType;
  }
  clean.entryType = entryType;

  if (entryType === ENTRY_TYPE.MAKEUP) {
    if (!sent('date')) errors.push('date is required for a makeup class');
    else clean.date = readDate(body.date, 'date', errors);
    for (const f of ['weekday', 'effectiveStartDate', 'effectiveEndDate']) {
      if (body[f] !== undefined) errors.push(`${f} is not used for a makeup class: its weekday comes from its date`);
    }
  } else {
    if (!sent('weekday')) errors.push('weekday is required');
    else clean.weekday = readWeekday(body.weekday, errors);
    if (body.date !== undefined) errors.push('date is only for a makeup class');
    if (sent('effectiveStartDate')) clean.effectiveStartDate = readDate(body.effectiveStartDate, 'effectiveStartDate', errors);
    if (sent('effectiveEndDate')) clean.effectiveEndDate = readDate(body.effectiveEndDate, 'effectiveEndDate', errors);
    if (Boolean(clean.effectiveStartDate) !== Boolean(clean.effectiveEndDate) && !errors.length) {
      errors.push('effectiveStartDate and effectiveEndDate must be given together');
    }
  }

  if (!sent('startTime')) errors.push('startTime is required');
  else clean.startTime = readTime(body.startTime, 'startTime', errors);
  if (!sent('endTime')) errors.push('endTime is required');
  else clean.endTime = readTime(body.endTime, 'endTime', errors);

  readCommon(body, clean, errors);
  checkOrder(clean, errors);
  finish(req, next, clean, errors);
};

// PATCH: any field except entryType. A makeup class is moved with `date`, a weekly class with
// `weekday`. effectiveStartDate and effectiveEndDate (null clears both) are for weekly classes.
const validateUpdateRule = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.entryType !== undefined) {
    errors.push('entryType cannot be changed. Withdraw this class and add a new one.');
  }
  if (body.subjectKey !== undefined) clean.subjectKey = readSubjectKey(body.subjectKey, errors);
  if (body.weekday !== undefined) clean.weekday = readWeekday(body.weekday, errors);
  if (body.date !== undefined) clean.date = readDate(body.date, 'date', errors);
  if (body.startTime !== undefined) clean.startTime = readTime(body.startTime, 'startTime', errors);
  if (body.endTime !== undefined) clean.endTime = readTime(body.endTime, 'endTime', errors);
  if (body.effectiveStartDate !== undefined) {
    clean.effectiveStartDate = readClearableDate(body.effectiveStartDate, 'effectiveStartDate', errors);
  }
  if (body.effectiveEndDate !== undefined) {
    clean.effectiveEndDate = readClearableDate(body.effectiveEndDate, 'effectiveEndDate', errors);
  }
  readCommon(body, clean, errors);

  const changes = Object.keys(clean).filter((k) => k !== 'confirmOverlap' && k !== 'note');
  if (!errors.length && !changes.length) throw new ApiError(400, 'No valid fields to update');

  checkOrder(clean, errors);
  finish(req, next, clean, errors);
};

// POST /withdraw and /restore  { note? }
const validateRuleNoteBody = (req, _res, next) => {
  const errors = [];
  const clean = {};
  const note = readNote(asObject(req.body).note, errors);
  if (note !== undefined) clean.note = note;
  finish(req, next, clean, errors);
};

// GET ?subjectKey=&weekday=&entryType=&status=active|withdrawn|all
const validateRuleListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = { status: 'active' };

  if (q.status !== undefined) {
    if (!STATUS_FILTERS.includes(q.status)) errors.push(`status must be one of ${STATUS_FILTERS.join(', ')}`);
    else out.status = q.status;
  }
  if (q.subjectKey !== undefined) {
    if (typeof q.subjectKey !== 'string' || !q.subjectKey.trim()) errors.push('subjectKey must be text');
    else out.subjectKey = q.subjectKey.trim();
  }
  if (q.weekday !== undefined) {
    const weekday = Number(q.weekday);
    if (q.weekday === '' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      errors.push('weekday must be a whole number from 0 to 6');
    } else out.weekday = weekday;
  }
  if (q.entryType !== undefined) {
    if (!ENTRY_TYPES.includes(q.entryType)) errors.push(`entryType must be one of ${ENTRY_TYPES.join(', ')}`);
    else out.entryType = q.entryType;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

export { validateCreateRule, validateUpdateRule, validateRuleNoteBody, validateRuleListQuery };