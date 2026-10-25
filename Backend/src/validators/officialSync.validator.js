import ApiError from '../utils/ApiError.js';

const STATUSES = ['all', 'pending', 'applied', 'dismissed', 'superseded'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

const asObject = (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});

// GET /updates?status=pending&limit=20
const validateUpdatesQuery = (req, _res, next) => {
  const q = asObject(req.query);
  const errors = [];
  const out = { status: 'all', limit: DEFAULT_LIMIT };

  if (q.status !== undefined) {
    if (!STATUSES.includes(q.status)) errors.push(`status must be one of ${STATUSES.join(', ')}`);
    else out.status = q.status;
  }
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (q.limit === '' || !Number.isInteger(n) || n < 1 || n > MAX_LIMIT) errors.push(`limit must be a whole number from 1 to ${MAX_LIMIT}`);
    else out.limit = n;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  req.validatedQuery = out;
  next();
};

export { validateUpdatesQuery };