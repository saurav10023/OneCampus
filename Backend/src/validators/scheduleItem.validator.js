import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { ITEM_UPDATE_FIELDS } from '../utils/scheduleItemRules.js';
import {
  SCHEDULE_ITEM_KIND,
  ITEM_STATUS,
  SLOT_KEYS,
  CLASS_TYPE,
  TIME_REGEX,
} from '../utils/constants.js';

// This file checks types and formats only. Which kinds need times, a subject or a slot is the
// model's job, and whether a subject, group or slot is valid for this schedule is the service's job.

const MAX_TITLE = 120;
const MAX_NOTE = 500;
const MAX_KEY = 64;
const MAX_GROUP = 20;
const MAX_BULK_ITEMS = 100;

const KINDS = Object.values(SCHEDULE_ITEM_KIND);
const STATUSES = Object.values(ITEM_STATUS);
const CLASS_TYPES = Object.values(CLASS_TYPE);

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

const readEnum = (value, allowed, name, errors) => {
  if (!allowed.includes(value)) {
    errors.push(`${name} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return value;
};

const readText = (value, name, max, errors) => {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${name} must be text`);
    return undefined;
  }
  const text = value.trim();
  if (text.length > max) {
    errors.push(`${name} can be at most ${max} characters`);
    return undefined;
  }
  return text;
};

const readTitle = (value, errors) => readText(value, 'title', MAX_TITLE, errors);

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

// "" means "none" for a group
const readGroup = (value, errors) => {
  if (typeof value !== 'string') {
    errors.push('group must be text');
    return undefined;
  }
  const text = value.trim().toLowerCase();
  if (text.length > MAX_GROUP) {
    errors.push(`group can be at most ${MAX_GROUP} characters`);
    return undefined;
  }
  return text || undefined;
};

// Cleans one item for creation. Shared by POST / and POST /bulk.
// { kind, title, startDate, endDate?, startTime?, endTime?, subjectKey?, slotKey?, classType?, group?, note? }
// endDate defaults to startDate. status, revision, affectsClasses, scheduleId and every other field
// are dropped. null on an optional field is the same as leaving it out.
const cleanCreateItem = (raw) => {
  const body = asObject(raw);
  const errors = [];
  const clean = {};
  const given = (field) => body[field] !== undefined && body[field] !== null;

  clean.kind = readEnum(body.kind, KINDS, 'kind', errors);
  clean.title = readTitle(body.title, errors);

  clean.startDate = readDate(body.startDate, 'startDate', errors);
  clean.endDate = given('endDate') ? readDate(body.endDate, 'endDate', errors) : clean.startDate;
  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    errors.push('endDate must be on or after startDate');
  }

  if (given('startTime')) clean.startTime = readTime(body.startTime, 'startTime', errors);
  if (given('endTime')) clean.endTime = readTime(body.endTime, 'endTime', errors);
  if (Boolean(clean.startTime) !== Boolean(clean.endTime) && !errors.length) {
    errors.push('startTime and endTime must be given together');
  }

  if (given('subjectKey')) clean.subjectKey = readText(body.subjectKey, 'subjectKey', MAX_KEY, errors);
  if (given('slotKey')) clean.slotKey = readEnum(body.slotKey, SLOT_KEYS, 'slotKey', errors);
  if (given('classType')) clean.classType = readEnum(body.classType, CLASS_TYPES, 'classType', errors);
  if (given('group')) clean.group = readGroup(body.group, errors);
  if (given('note')) clean.note = readText(body.note, 'note', MAX_NOTE, errors);

  return { clean, errors };
};

// POST /
const validateCreateItem = (req, _res, next) => {
  const { clean, errors } = cleanCreateItem(req.body);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

// POST /bulk   { items: [ <same fields as POST />, ... ], note? }
// 1 to 100 items. Every item is checked and every problem is reported with its position, e.g.
// "items[2].endDate must be on or after startDate". Nothing is saved unless all items pass.
const validateBulkCreateItems = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ApiError(400, 'Validation failed', ['items must be a non-empty list']);
  }
  if (body.items.length > MAX_BULK_ITEMS) {
    throw new ApiError(400, 'Validation failed', [`items can have at most ${MAX_BULK_ITEMS} entries`]);
  }

  const items = body.items.map((raw, index) => {
    const result = cleanCreateItem(raw);
    result.errors.forEach((message) => errors.push(`items[${index}].${message}`));
    return result.clean;
  });

  let note;
  if (body.note !== undefined && body.note !== null) note = readText(body.note, 'note', MAX_NOTE, errors);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = note === undefined ? { items } : { items, note };
  next();
};

// PATCH /:itemId   any of title, startDate, endDate, startTime, endTime, subjectKey, slotKey,
// classType, group, note (at least one). null removes a field that may be empty.
// The kind cannot be changed.
const validateUpdateItem = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};

  if (body.kind !== undefined) {
    errors.push('kind cannot be changed. Withdraw this item and create a new one.');
  }

  for (const field of ITEM_UPDATE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;

    // null clears a field that may be empty; the others must always have a value
    const mustHaveValue = field === 'title' || field === 'startDate' || field === 'endDate';
    if (value === null) {
      if (mustHaveValue) errors.push(`${field} cannot be removed`);
      else clean[field] = null;
      continue;
    }

    if (field === 'title') clean.title = readTitle(value, errors);
    else if (field === 'startDate' || field === 'endDate') clean[field] = readDate(value, field, errors);
    else if (field === 'startTime' || field === 'endTime') clean[field] = readTime(value, field, errors);
    else if (field === 'subjectKey') clean.subjectKey = readText(value, 'subjectKey', MAX_KEY, errors);
    else if (field === 'slotKey') clean.slotKey = readEnum(value, SLOT_KEYS, 'slotKey', errors);
    else if (field === 'classType') clean.classType = readEnum(value, CLASS_TYPES, 'classType', errors);
    else if (field === 'group') {
      const group = readGroup(value, errors);
      // an empty group means "the whole section"
      clean.group = group ?? null;
    } else if (field === 'note') clean.note = readText(value, 'note', MAX_NOTE, errors);
  }

  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    errors.push('endDate must be on or after startDate');
  }
  if (!errors.length && !Object.keys(clean).length) errors.push('No valid fields to update');

  if (errors.length) {
    throw new ApiError(
      400,
      errors[0] === 'No valid fields to update' ? 'No valid fields to update' : 'Validation failed',
      errors
    );
  }
  req.body = clean;
  next();
};

// POST /:itemId/withdraw | restore   { note? }
const validateItemNoteBody = (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  let note;
  if (body.note !== undefined && body.note !== null) note = readText(body.note, 'note', MAX_NOTE, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = note === undefined ? {} : { note };
  next();
};

// GET /?kind=exam&status=active&subjectKey=&slotKey=midsem&from=2026-10-01&to=2026-10-31   (all optional)
const validateItemListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const clean = {};

  if (q.kind !== undefined) clean.kind = readEnum(q.kind, KINDS, 'kind', errors);
  if (q.status !== undefined) clean.status = readEnum(q.status, STATUSES, 'status', errors);
  if (q.slotKey !== undefined) clean.slotKey = readEnum(q.slotKey, SLOT_KEYS, 'slotKey', errors);
  if (q.subjectKey !== undefined) clean.subjectKey = readText(q.subjectKey, 'subjectKey', MAX_KEY, errors);
  if (q.from !== undefined) clean.from = readDate(q.from, 'from', errors);
  if (q.to !== undefined) clean.to = readDate(q.to, 'to', errors);
  if (clean.from && clean.to && clean.to < clean.from) errors.push('to must be on or after from');

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = clean;
  next();
};

const validateItemIdParam = (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.itemId)) throw new ApiError(400, 'Invalid itemId');
  next();
};

export {
  validateCreateItem,
  validateBulkCreateItems,
  validateUpdateItem,
  validateItemNoteBody,
  validateItemListQuery,
  validateItemIdParam,
};