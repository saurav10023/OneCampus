import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { OPT_OUT_KINDS } from '../utils/officialUpdateRules.js';

// Types and formats only. Whether an action is allowed on a line is the service's job.

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

const idParam = (name) => (req, _res, next) => {
  if (!mongoose.isValidObjectId(req.params[name])) throw new ApiError(404, 'Not found');
  next();
};

const validateUpdateIdParam = idParam('updateId');
const validateRuleIdParam = idParam('ruleId');
const validateSubjectIdParam = idParam('subjectId');

// DELETE /opt-outs/:kind/:id
const validateOptOutParams = (req, _res, next) => {
  if (!OPT_OUT_KINDS.includes(req.params.kind)) {
    throw new ApiError(400, 'Validation failed', [`kind must be one of ${OPT_OUT_KINDS.join(', ')}`]);
  }
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'Not found');
  next();
};

// A body with only the listed true/false flags. Anything else is dropped.
const flagsBody = (...names) => (req, _res, next) => {
  const body = asObject(req.body);
  const errors = [];
  const clean = {};
  for (const name of names) {
    if (body[name] === undefined) continue;
    if (typeof body[name] !== 'boolean') errors.push(`${name} must be true or false`);
    else clean[name] = body[name];
  }
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.body = clean;
  next();
};

const validateAcceptBody = flagsBody('confirm', 'confirmOverlap'); // POST /updates/:updateId/accept
const validateConfirmBody = flagsBody('confirm'); // POST /subjects/:subjectId/reattach

export {
  validateUpdateIdParam,
  validateRuleIdParam,
  validateSubjectIdParam,
  validateOptOutParams,
  validateAcceptBody,
  validateConfirmBody,
};