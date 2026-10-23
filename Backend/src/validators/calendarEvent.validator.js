import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { EVENT_TYPE, TIME_REGEX } from '../utils/constants.js';

const EVENT_TYPES = Object.values(EVENT_TYPE);
const MAX_TITLE = 120;
const MAX_NOTE = 500;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// Each reader returns the cleaned value, or undefined after pushing an error.
// Nothing outside these readers reaches the controller, so source, confirmedAt, officialRef,
// followOfficial, importJobId, extraction, setupId and every other field are dropped.

const readTitle = (value, errors) => {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push('title must be a non-empty string');
    return undefined;
  }
  if (value.trim().length > MAX_TITLE) {
    errors.push(`title can be at most ${MAX_TITLE} characters`);
    return undefined;
  }
  return value.trim();
};

const readType = (value, errors) => {
  if (!EVENT_TYPES.includes(value)) {
    errors.push(`type must be one of ${EVENT_TYPES.join(', ')}`);
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

const readTime = (value, name, errors) => {
  if (typeof value !== 'string' || !TIME_REGEX.test(value)) {
    errors.push(`${name} must be a time like 09:30 (24-hour)`);
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
  if (typeof value !== 'string') {
    errors.push('note must be text');
    return undefined;
  }
  if (value.trim().length > MAX_NOTE) {
    errors.push(`note can be at most ${MAX_NOTE} characters`);
    return undefined;
  }
  return value.trim();
};

// Checks that only need the request itself. Rules that depend on the event's type (times only on
// a quiz or event, a timed event on one date, a quiz never cancelling) are made by the model.
const checkOrder = (clean, errors) => {
  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    errors.push('endDate must be on or after startDate');
  }
  if (clean.startTime && clean.endTime && clean.endTime <= clean.startTime) {
    errors.push('endTime must be later than startTime');
  }
};

const finish = (req, next, clean, errors) => {
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validated = { ...(req.validated ?? {}), body: clean };
  next();
};

// POST { title, type?, startDate, endDate?, startTime?, endTime?, affectsClasses?, note? }
// endDate defaults to startDate. type defaults to holiday (in the model). null counts as "not sent".
const validateCreateEvent = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};
  const sent = (k) => body[k] !== undefined && body[k] !== null;

  if (!sent('title')) errors.push('title is required');
  else clean.title = readTitle(body.title, errors);

  if (sent('type')) clean.type = readType(body.type, errors);

  if (!sent('startDate')) errors.push('startDate is required');
  else clean.startDate = readDate(body.startDate, 'startDate', errors);
  if (sent('endDate')) clean.endDate = readDate(body.endDate, 'endDate', errors);
  else if (clean.startDate) clean.endDate = clean.startDate;

  if (sent('startTime')) clean.startTime = readTime(body.startTime, 'startTime', errors);
  if (sent('endTime')) clean.endTime = readTime(body.endTime, 'endTime', errors);
  if (Boolean(clean.startTime) !== Boolean(clean.endTime) && !errors.length) {
    errors.push('startTime and endTime must be given together');
  }

  if (sent('affectsClasses')) clean.affectsClasses = readBoolean(body.affectsClasses, 'affectsClasses', errors);
  if (sent('note')) clean.note = readNote(body.note, errors);

  checkOrder(clean, errors);
  finish(req, next, clean, errors);
};

// PATCH: any of the same fields. null on startTime, endTime or note removes it.
const validateUpdateEvent = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.title !== undefined) clean.title = readTitle(body.title, errors);
  if (body.type !== undefined) clean.type = readType(body.type, errors);
  if (body.startDate !== undefined) clean.startDate = readDate(body.startDate, 'startDate', errors);
  if (body.endDate !== undefined) clean.endDate = readDate(body.endDate, 'endDate', errors);
  if (body.affectsClasses !== undefined) clean.affectsClasses = readBoolean(body.affectsClasses, 'affectsClasses', errors);

  for (const name of ['startTime', 'endTime']) {
    if (body[name] === undefined) continue;
    clean[name] = body[name] === null ? null : readTime(body[name], name, errors);
  }
  if (body.note !== undefined) clean.note = body.note === null ? null : readNote(body.note, errors);

  if (!errors.length && !Object.keys(clean).length) {
    throw new ApiError(400, 'No valid fields to update');
  }
  checkOrder(clean, errors);
  finish(req, next, clean, errors);
};

// GET ?from=2026-09-01&to=2026-09-30&type=holiday&includeDrafts=true  (all optional)
const validateListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const query = {};

  if (q.from !== undefined) query.from = readDate(q.from, 'from', errors);
  if (q.to !== undefined) query.to = readDate(q.to, 'to', errors);
  if (query.from && query.to && query.to < query.from) errors.push('to must be on or after from');
  if (q.type !== undefined) query.type = readType(q.type, errors);
  if (q.includeDrafts !== undefined) {
    if (q.includeDrafts !== 'true' && q.includeDrafts !== 'false') errors.push('includeDrafts must be true or false');
    else query.includeDrafts = q.includeDrafts === 'true';
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validated = { ...(req.validated ?? {}), query };
  next();
};

export { validateCreateEvent, validateUpdateEvent, validateListQuery };