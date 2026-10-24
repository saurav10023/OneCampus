import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { ACTION_TARGET, ACTION_OP } from '../utils/constants.js';
import { validateCreateItem } from './scheduleItem.validator.js';

// Types and formats only. Whether an action can be undone is the service's job.

const MAX_NOTE = 500;
const MAX_LIMIT = 100;
const KINDS = Object.values(ACTION_TARGET);
const OPS = Object.values(ACTION_OP);

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

const validateActionIdParam = (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params.actionId)) throw new ApiError(400, 'Invalid actionId');
  next();
};

// POST /:actionId/undo | redo | revert   { note? }
const validateActionNoteBody = (req, _res, next) => {
  const body = asObject(req.body);
  let note;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string' || !body.note.trim()) throw new ApiError(400, 'Validation failed', ['note must be text']);
    note = body.note.trim();
    if (note.length > MAX_NOTE) throw new ApiError(400, 'Validation failed', [`note can be at most ${MAX_NOTE} characters`]);
  }
  req.body = note === undefined ? {} : { note };
  next();
};

// GET /?kind=item&targetId=...&op=undo&before=42&limit=50   (all optional)
const validateActionListQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const clean = {};

  if (q.kind !== undefined) {
    if (KINDS.includes(q.kind)) clean.kind = q.kind;
    else errors.push(`kind must be one of ${KINDS.join(', ')}`);
  }
  if (q.op !== undefined) {
    if (OPS.includes(q.op)) clean.op = q.op;
    else errors.push(`op must be one of ${OPS.join(', ')}`);
  }
  if (q.targetId !== undefined) {
    if (mongoose.isValidObjectId(q.targetId)) clean.targetId = q.targetId;
    else errors.push('targetId must be a valid id');
  }
  for (const [field, max] of [['before', Number.MAX_SAFE_INTEGER], ['limit', MAX_LIMIT]]) {
    if (q[field] === undefined) continue;
    const value = Number(q[field]);
    if (Number.isInteger(value) && value >= 1 && value <= max) clean[field] = value;
    else errors.push(`${field} must be a whole number from 1 to ${max}`);
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = clean;
  next();
};

// POST /impact-preview   { itemId }   or the fields of a new item: { kind, startDate, endDate?, ... }
// The title is optional here: a preview does not need a name.
const validateImpactBody = (req, res, next) => {
  const body = asObject(req.body);

  if (body.itemId !== undefined) {
    if (!mongoose.isValidObjectId(body.itemId)) throw new ApiError(400, 'Validation failed', ['itemId must be a valid id']);
    req.body = { itemId: String(body.itemId) };
    return next();
  }

  req.body = { ...body, title: typeof body.title === 'string' && body.title.trim() ? body.title : 'Preview' };
  return validateCreateItem(req, res, next);
};

export { validateActionIdParam, validateActionNoteBody, validateActionListQuery, validateImpactBody };