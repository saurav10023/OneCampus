import { EVENT_TYPE, TIMED_EVENT_TYPES, TIME_REGEX } from '../utils/constants.js';
import ApiError from '../utils/ApiError.js';

// Student-facing validation for calendar events.
//
// SECURITY: only the fields listed in EVENT_FIELDS ever reach the service. Everything else in the
// body (source, officialRef, followOfficial, officialRevisionSeen, officialWithdrawn,
// lastAutoUpdate, importJobId, extraction, confirmedAt, setupId, _id ...) is silently dropped,
// so a student can never forge an official link. Only the sync and import services set those.
//
// Written without a validation library so it has no dependencies. The result is placed on
// req.validated. If you use Joi, Zod or express-validator, keep the same rules.

const TYPE_VALUES = Object.values(EVENT_TYPE);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 120;
const NOTE_MAX = 500;

// "YYYY-MM-DD" -> Date at UTC midnight, or null when not a real calendar date
export const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const fail = (details) =>
  new ApiError(
    400,
    'Validation failed',
    details.map((d) => `${d.field}: ${d.message}`)
  );

// Reads the allowed fields from a body. On create, title/type/startDate are required.
// On update (partial) every field is optional, and null clears startTime, endTime and note.
const readEventFields = (body, { partial }) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  const value = {};

  if (!isPlainObject(body)) {
    throw fail([{ field: 'body', message: 'Request body must be a JSON object' }]);
  }

  // title
  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > TITLE_MAX) {
      add('title', `title must be 1 to ${TITLE_MAX} characters`);
    } else value.title = title;
  } else if (!partial) add('title', 'title is required');

  // type
  if (body.type !== undefined) {
    if (!TYPE_VALUES.includes(body.type)) {
      add('type', `type must be one of: ${TYPE_VALUES.join(', ')}`);
    } else value.type = body.type;
  } else if (!partial) add('type', 'type is required');

  // dates
  if (body.startDate !== undefined) {
    const date = parseDateOnly(body.startDate);
    if (!date) add('startDate', 'startDate must be a real date written YYYY-MM-DD');
    else value.startDate = date;
  } else if (!partial) add('startDate', 'startDate is required');

  if (body.endDate !== undefined) {
    const date = parseDateOnly(body.endDate);
    if (!date) add('endDate', 'endDate must be a real date written YYYY-MM-DD');
    else value.endDate = date;
  }

  // times: HH:mm, or null to clear on update
  for (const field of ['startTime', 'endTime']) {
    if (body[field] === undefined) continue;
    if (body[field] === null) {
      if (partial) value[field] = null;
    } else if (typeof body[field] !== 'string' || !TIME_REGEX.test(body[field])) {
      add(field, `${field} must be HH:mm (24-hour)`);
    } else value[field] = body[field];
  }

  // affectsClasses
  if (body.affectsClasses !== undefined) {
    if (typeof body.affectsClasses !== 'boolean') {
      add('affectsClasses', 'affectsClasses must be true or false');
    } else value.affectsClasses = body.affectsClasses;
  }

  // note
  if (body.note !== undefined) {
    if (body.note === null) {
      if (partial) value.note = null;
    } else if (typeof body.note !== 'string' || body.note.trim().length > NOTE_MAX) {
      add('note', `note must be text of at most ${NOTE_MAX} characters`);
    } else value.note = body.note.trim();
  }

  return { value, errors, add };
};

// Rules that only need the fields in this one request
const checkWithinBody = (value, add, { partial }) => {
  const { type, startDate, endDate, startTime, endTime, affectsClasses } = value;

  if (startDate && endDate && endDate < startDate) {
    add('endDate', 'endDate cannot be before startDate');
  }
  if (type === EVENT_TYPE.QUIZ && affectsClasses === true) {
    add('affectsClasses', 'A quiz cannot cancel classes');
  }

  const hasStart = typeof startTime === 'string';
  const hasEnd = typeof endTime === 'string';
  if (!partial && hasStart !== hasEnd) {
    add('endTime', 'startTime and endTime must be given together');
  }
  if (hasStart && hasEnd) {
    if (endTime <= startTime) add('endTime', 'endTime must be later than startTime');
    if (type && !TIMED_EVENT_TYPES.includes(type)) {
      add('startTime', 'Times are only allowed on quiz and event types');
    }
    if (affectsClasses === true) {
      add('startTime', 'An event that cancels classes cannot have times');
    }
    if (startDate && endDate && startDate.getTime() !== endDate.getTime()) {
      add('endDate', 'A timed event must be on a single date');
    }
  }
};

export const validateCreateEvent = (req, res, next) => {
  try {
    const { value, errors, add } = readEventFields(req.body, { partial: false });
    checkWithinBody(value, add, { partial: false });
    if (errors.length) throw fail(errors);
    req.validated = { body: value };
    next();
  } catch (err) {
    next(err);
  }
};

export const validateUpdateEvent = (req, res, next) => {
  try {
    const { value, errors, add } = readEventFields(req.body, { partial: true });
    checkWithinBody(value, add, { partial: true });
    if (!errors.length && Object.keys(value).length === 0) {
      add('body', 'Send at least one field to change');
    }
    if (errors.length) throw fail(errors);
    req.validated = { body: value };
    next();
  } catch (err) {
    next(err);
  }
};

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&type=holiday&confirmed=true
export const validateListEvents = (req, res, next) => {
  try {
    const errors = [];
    const query = {};
    const { from, to, type, confirmed } = req.query ?? {};

    if (from !== undefined) {
      const date = parseDateOnly(from);
      if (!date) errors.push({ field: 'from', message: 'from must be YYYY-MM-DD' });
      else query.from = date;
    }
    if (to !== undefined) {
      const date = parseDateOnly(to);
      if (!date) errors.push({ field: 'to', message: 'to must be YYYY-MM-DD' });
      else query.to = date;
    }
    if (query.from && query.to && query.to < query.from) {
      errors.push({ field: 'to', message: 'to cannot be before from' });
    }
    if (type !== undefined) {
      if (!TYPE_VALUES.includes(type)) {
        errors.push({ field: 'type', message: `type must be one of: ${TYPE_VALUES.join(', ')}` });
      } else query.type = type;
    }
    if (confirmed !== undefined) {
      if (confirmed !== 'true' && confirmed !== 'false') {
        errors.push({ field: 'confirmed', message: 'confirmed must be true or false' });
      } else query.confirmed = confirmed === 'true';
    }

    if (errors.length) throw fail(errors);
    req.validated = { query };
    next();
  } catch (err) {
    next(err);
  }
};