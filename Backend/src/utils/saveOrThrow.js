import ApiError from './ApiError.js';

// Saves a Mongoose document and turns the two errors a request can cause into clean API errors:
//   - a validation error becomes a 400 listing every message, not a 500
//   - a duplicate-key error (code 11000) becomes a 409, when the caller gives a message for it
//
//   await saveOrThrow(subject);
//   await saveOrThrow(subject, { duplicate: 'A subject with this name or code already exists' });
//
// Without `duplicate`, a duplicate-key error is rethrown as it is, so the caller can handle it.
// Edit through document.save(): findOneAndUpdate and updateOne skip validation and the
// pre('validate') hooks the Official models rely on.
const toValidationError = (err) =>
  new ApiError(400, 'Validation failed', Object.values(err.errors).map((e) => e.message));

const saveOrThrow = async (doc, { duplicate } = {}) => {
  try {
    return await doc.save();
  } catch (err) {
    if (err?.name === 'ValidationError') throw toValidationError(err);
    if (duplicate && err?.code === 11000) throw new ApiError(409, duplicate);
    throw err;
  }
};

// Runs the model's validation without saving. Call it before taking a revision, so a bad edit is
// refused without using up a revision number.
const validateOrThrow = async (doc) => {
  try {
    await doc.validate();
  } catch (err) {
    if (err?.name === 'ValidationError') throw toValidationError(err);
    throw err;
  }
};

export default saveOrThrow;
export { saveOrThrow, validateOrThrow };