import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import {
  CAUSE_TYPE,
  EVENT_SOURCE,
  EVENT_TYPE,
  EVENT_AFFECTS_CLASSES_DEFAULT,
  LONG_RANGE_WARNING_DAYS,
  DAY_MS,
} from '../utils/constants.js';
import { applyCancellation, revertCause } from './cancellation.service.js';

// All cancelling and restoring goes through the shared cancellation service.
// ASSUMPTION: revertCause({ setupId, userId, cause }) takes the same cause object as
// applyCancellation. If your signature differs, change it in revertFootprint only.

// Fields a student request may set. source, confirmedAt, officialRef, followOfficial,
// importJobId, extraction and every other official field are never read from input.
const INPUT_FIELDS = ['title', 'type', 'startDate', 'endDate', 'startTime', 'endTime', 'affectsClasses', 'note'];
// null on these means "remove it"
const CLEARABLE_FIELDS = ['startTime', 'endTime', 'note'];

const maxDate = (a, b) => (a > b ? a : b);
const minDate = (a, b) => (a < b ? a : b);
const causeOf = (event) => ({ type: CAUSE_TYPE.CALENDAR_EVENT, id: event._id });

// Only a confirmed event that affects classes holds any class. Drafts cancel nothing.
const isCancelling = (event) => Boolean(event.confirmedAt) && event.affectsClasses === true;

// A quiz never cancels classes: the server forces it, the student does not choose it
const resolveAffects = (type, requested) => {
  if (type === EVENT_TYPE.QUIZ) return false;
  return requested ?? EVENT_AFFECTS_CLASSES_DEFAULT[type] ?? false;
};

const pickFields = (input = {}) => {
  const picked = {};
  for (const field of INPUT_FIELDS) {
    if (input[field] !== undefined) picked[field] = input[field];
  }
  return picked;
};

// ---------- Cancellation, through the shared service ----------

// Idempotent: running it twice changes nothing the second time
const applyFootprint = async (setup, userId, event) => {
  if (!isCancelling(event)) return null;
  // Classes only exist inside the setup's range, so clip the event to it
  const from = maxDate(event.startDate, setup.startDate);
  const to = minDate(event.endDate, setup.endDate);
  if (from > to) return { cancelled: 0 };
  return applyCancellation({
    setupId: setup._id,
    userId,
    filter: { from, to },
    cause: causeOf(event),
  });
};

// Gives back every class this event holds. A class another event also covers stays cancelled
// under that event (revertCause resolves overlaps).
const revertFootprint = (setup, userId, event) =>
  revertCause({ setupId: setup._id, userId, cause: causeOf(event) });

const buildWarnings = (setup, event) => {
  const warnings = [];
  if (event.endDate < setup.startDate || event.startDate > setup.endDate) {
    warnings.push('This event is outside your setup\'s date range, so it does not affect any class.');
  }
  const days = Math.round((event.endDate.getTime() - event.startDate.getTime()) / DAY_MS) + 1;
  if (days > LONG_RANGE_WARNING_DAYS) {
    warnings.push(`This event covers ${days} days. Check the dates are right.`);
  }
  return warnings;
};

// ---------- Read ----------

// query (all optional): { from, to, type, includeDrafts }. Events that overlap [from, to].
const listEvents = async (setup, query = {}) => {
  const filter = { setupId: setup._id };
  if (query.from) filter.endDate = { $gte: query.from };
  if (query.to) filter.startDate = { $lte: query.to };
  if (query.type) filter.type = query.type;
  // Drafts (image import, not yet reviewed) are hidden unless asked for
  if (!query.includeDrafts) filter.confirmedAt = { $ne: null };

  return CalendarEvent.find(filter).sort({ startDate: 1, _id: 1 }).lean();
};

// ---------- Create ----------

const createEvent = async ({ setup, userId, input }) => {
  const fields = pickFields(input);
  for (const key of Object.keys(fields)) if (fields[key] === null) delete fields[key];

  const type = fields.type ?? EVENT_TYPE.HOLIDAY;
  const event = new CalendarEvent({
    ...fields,
    type,
    affectsClasses: resolveAffects(type, fields.affectsClasses),
    setupId: setup._id,
    source: EVENT_SOURCE.MANUAL,
    confirmedAt: new Date(), // drafts only come from the image import
  });
  await event.save(); // validation errors surface before any class is touched

  let cancellation;
  try {
    cancellation = await applyFootprint(setup, userId, event);
  } catch (err) {
    // Leave nothing half-done, so the request can simply be retried
    await revertFootprint(setup, userId, event).catch(() => {});
    await CalendarEvent.deleteOne({ _id: event._id }).catch(() => {});
    throw err;
  }

  return { event, cancellation, warnings: buildWarnings(setup, event) };
};

// ---------- Update ----------

const updateEvent = async ({ setup, userId, event, input }) => {
  const fields = pickFields(input);
  const wasCancelling = isCancelling(event);

  const nextType = fields.type ?? event.type;
  if (fields.type !== undefined && fields.type !== event.type && fields.affectsClasses === undefined) {
    fields.affectsClasses = resolveAffects(nextType, undefined); // new type, new default
  }
  if (nextType === EVENT_TYPE.QUIZ) fields.affectsClasses = false;

  for (const [key, value] of Object.entries(fields)) {
    if (value === null) {
      if (CLEARABLE_FIELDS.includes(key)) event.set(key, undefined);
    } else {
      event.set(key, value);
    }
  }

  // Validate first, so a bad edit is refused before any class is changed
  await event.validate();

  const footprintChanged =
    wasCancelling &&
    (event.isModified('startDate') || event.isModified('endDate') || event.isModified('affectsClasses'));

  // Order: give back the old classes, save, then take the new ones. Each step is idempotent.
  if (footprintChanged) await revertFootprint(setup, userId, event);

  try {
    await event.save();
  } catch (err) {
    if (footprintChanged) {
      const saved = await CalendarEvent.findById(event._id);
      if (saved) await applyFootprint(setup, userId, saved).catch(() => {}); // put the old state back
    }
    throw err;
  }

  // Always applied when the event cancels classes: safe to run twice, and it makes a retry
  // after a crash finish the job
  const cancellation = await applyFootprint(setup, userId, event);
  return { event, cancellation, warnings: buildWarnings(setup, event) };
};

// ---------- Delete ----------

// Classes are given back first. If the request dies before the delete, the event is still there
// and a retry finishes it. The other order would leave classes held by an event that is gone.
const deleteEvent = async ({ setup, userId, event }) => {
  let restored = null;
  if (isCancelling(event)) restored = await revertFootprint(setup, userId, event);
  await CalendarEvent.deleteOne({ _id: event._id, setupId: setup._id });
  return { deleted: true, restored };
};

// ---------- Confirm ----------

// Turns a draft into a real event. Only drafts can be confirmed.
const confirmEvent = async ({ setup, userId, event }) => {
  if (event.confirmedAt) {
    const err = new Error('Event is already confirmed');
    err.statusCode = 409;
    throw err;
  }

  event.confirmedAt = new Date();
  await event.save();

  let cancellation;
  try {
    cancellation = await applyFootprint(setup, userId, event);
  } catch (err) {
    // Back to a draft, so the confirm can be tried again
    await revertFootprint(setup, userId, event).catch(() => {});
    event.confirmedAt = null;
    await event.save().catch(() => {});
    throw err;
  }

  return { event, cancellation, warnings: buildWarnings(setup, event) };
};

export { listEvents, createEvent, updateEvent, deleteEvent, confirmEvent };