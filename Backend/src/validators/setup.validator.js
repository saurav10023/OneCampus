import ApiError from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
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

// Whitelist: only the fields built here reach the controller, so official fields
// (source, officialScheduleId, scopeKey, sharing pointers) can never come from a student.
const buildCleanBody = (rawBody, { partial }) => {
  const body =
    rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? rawBody : {};
  const errors = [];
  const clean = {};

  // Text fields
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

  // Academic year
  if (clean.academicYear && !ACADEMIC_YEAR_REGEX.test(clean.academicYear)) {
    errors.push('academicYear must look like 2026-27');
  }

  // Dates
  for (const field of DATE_FIELDS) {
    const value = body[field];
    if (value === undefined) {
      if (!partial) errors.push(`${field} is required`);
    } else {
      const parsed = parseDateOnly(value);
      if (!parsed) {
        errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
      } else {
        clean[field] = parsed;
      }
    }
  }

  // Timezone
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || !isValidTimezone(body.timezone)) {
      errors.push('timezone must be a valid IANA timezone, e.g. Asia/Kolkata');
    } else {
      clean.timezone = body.timezone;
    }
  }

  // Attendance target
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
      } else {
        clean.leaveOfficial = body.leaveOfficial;
      }
    }
  } else if (body.archivePrevious !== undefined) {
    if (typeof body.archivePrevious !== 'boolean') {
      errors.push('archivePrevious must be true or false');
    } else {
      clean.archivePrevious = body.archivePrevious;
    }
  }

  // Date range
  if (clean.startDate && clean.endDate && clean.endDate < clean.startDate) {
    errors.push('endDate must be on or after startDate');
  }

  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }
  return clean;
};

// Validation middleware. next() is required: it is how Express reaches the controller.
const validateCreateSetup = asyncHandler(async(req, res, next) => {
  req.body = buildCleanBody(req.body, { partial: false });
  return next();
});

const validateUpdateSetup = asyncHandler(async(req, res, next) => {
  const clean = buildCleanBody(req.body, { partial: true });
  // leaveOfficial is a flag, not a change, so it does not count as a field to update
  const changeCount = Object.keys(clean).filter((k) => k !== 'leaveOfficial').length;
  if (changeCount === 0) {
    throw new ApiError(400, 'No valid fields to update');
  }
  req.body = clean;
  return next();
});

export { validateCreateSetup, validateUpdateSetup };