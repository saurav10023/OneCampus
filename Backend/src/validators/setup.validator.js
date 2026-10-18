import ApiError from '../utils/ApiError.js';
import { parseDateOnly } from '../utils/date.util.js';
import { ACADEMIC_YEAR_REGEX } from '../utils/constants.js';

const TEXT_FIELDS = ['name', 'academicYear', 'semesterLabel', 'branch', 'section'];
const DATE_FIELDS = ['startDate', 'endDate'];

const isValidTimezone = (tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Builds a whitelisted body so unknown fields can never reach the controller or the model.
// Dropped on purpose: ownerId, status, scopeKey, officialScheduleId, joinedOfficialAt,
// officialGroups, lastSyncedContentRevision and the sharing fields. Only the join service sets
// the official ones.
//
// Control flags (not stored on the setup):
//   archivePrevious (create): archive an existing active setup with the same scope
//   leaveOfficial   (update): confirm that changing the scope of a joined setup is intended
const buildCleanBody = (rawBody, { partial }) => {
  const body = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody : {};
  const errors = [];
  const clean = {};

  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) {
      if (!partial) errors.push(`${field} is required`);
    } else if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${field} must be a non-empty string`);
    } else {
      clean[field] = value.trim();
    }
  }

  // The year is checked by pattern here so the student gets a clear 400
  if (clean.academicYear && !ACADEMIC_YEAR_REGEX.test(clean.academicYear)) {
    errors.push('academicYear must look like 2026-27');
  }

  for (const field of DATE_FIELDS) {
    const value = body[field];
    if (value === undefined) {
      if (!partial) errors.push(`${field} is required`);
    } else {
      const parsed = parseDateOnly(value);
      if (!parsed) errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
      else clean[field] = parsed;
    }
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !isValidTimezone(body.timezone)) {
      errors.push('timezone must be a valid IANA timezone, e.g. Asia/Kolkata');
    } else {
      clean.timezone = body.timezone;
    }
  }

  // Overall attendance target, 0 to 100. A subject's own target overrides it.
  if (body.targetPercentage !== undefined) {
    const value = body.targetPercentage;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      errors.push('targetPercentage must be a number from 0 to 100');
    } else {
      clean.targetPercentage = value;
    }
  }

  // Control flags
  if (partial) {
    if (body.leaveOfficial !== undefined) {
      if (typeof body.leaveOfficial !== 'boolean') {
        errors.push('leaveOfficial must be true or false');
      } else clean.leaveOfficial = body.leaveOfficial;
    }
  } else if (body.archivePrevious !== undefined) {
    if (typeof body.archivePrevious !== 'boolean') {
      errors.push('archivePrevious must be true or false');
    } else clean.archivePrevious = body.archivePrevious;
  }

  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    errors.push('endDate must be on or after startDate');
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  return clean;
};

const validateCreateSetup = (req, _res, next) => {
  req.body = buildCleanBody(req.body, { partial: false });
  next();
};

const validateUpdateSetup = (req, _res, next) => {
  const clean = buildCleanBody(req.body, { partial: true });
  // A request with only the leaveOfficial flag changes nothing
  const { leaveOfficial, ...changes } = clean;
  if (!Object.keys(changes).length) {
    throw new ApiError(400, 'No valid fields to update');
  }
  req.body = clean;
  next();
};

export { validateCreateSetup, validateUpdateSetup };