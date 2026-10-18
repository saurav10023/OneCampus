import ApiError from '../utils/ApiError.js';

const SORTS = ['rank', 'popular', 'rating', 'new'];

// Only plain non-empty strings pass, which also blocks query-operator injection like ?branch[$ne]=x
const cleanString = (value) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const optionalText = (body, field, maxLength, errors) => {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    errors.push(`${field} must be a non-empty string up to ${maxLength} characters`);
    return undefined;
  }
  return value.trim();
};

const validatePublishBody = (req, _res, next) => {
  const errors = [];
  const clean = {
    title: optionalText(req.body, 'title', 120, errors),
    description: optionalText(req.body, 'description', 1000, errors),
    collegeId: optionalText(req.body, 'collegeId', 100, errors),
  };
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);

  req.body = clean;
  next();
};

const validateVersionBody = (req, _res, next) => {
  const errors = [];
  const changeSummary = optionalText(req.body, 'changeSummary', 500, errors);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);

  req.body = { changeSummary };
  next();
};

const validateListQuery = (req, _res, next) => {
  const errors = [];
  const sort = req.query.sort ?? 'rank';
  const page = Number.parseInt(req.query.page ?? '1', 10);
  const limit = Number.parseInt(req.query.limit ?? '20', 10);

  if (!SORTS.includes(sort)) errors.push(`sort must be one of: ${SORTS.join(', ')}`);
  if (!Number.isInteger(page) || page < 1) errors.push('page must be 1 or greater');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    errors.push('limit must be between 1 and 50');
  }
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);

  // Stored separately because req.query is read-only in newer Express versions
  req.validatedQuery = {
    q: cleanString(req.query.q),
    branch: cleanString(req.query.branch),
    semesterLabel: cleanString(req.query.semesterLabel),
    academicYear: cleanString(req.query.academicYear),
    collegeId: cleanString(req.query.collegeId),
    sort,
    page,
    limit,
  };
  next();
};

const validateRatingBody = (req, _res, next) => {
  const { rating } = req.body ?? {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, 'Validation failed', ['rating must be a whole number from 1 to 5']);
  }
  req.body = { rating };
  next();
};

export {
  validatePublishBody,
  validateVersionBody,
  validateListQuery,
  validateRatingBody,
};