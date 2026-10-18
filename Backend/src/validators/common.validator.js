import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';

// Rejects malformed ids early instead of letting Mongoose throw a CastError
const validateObjectIdParam = (...names) => (req, _res, next) => {
  const invalid = names.filter((name) => !mongoose.isValidObjectId(req.params[name]));
  if (invalid.length) {
    throw new ApiError(400, 'Validation failed', invalid.map((n) => `${n} is not a valid id`));
  }
  next();
};

export { validateObjectIdParam };