import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import Setup from '../models/TimeTable/setup.model.js';

// Never trust a client-supplied setup id: ownership is checked in the query itself
const loadOwnedSetup = asyncHandler(async (req, _res, next) => {
  const { setupId } = req.params;

  if (!mongoose.isValidObjectId(setupId)) {
    throw new ApiError(400, 'Invalid setup id');
  }

  const setup = await Setup.findOne({ _id: setupId, ownerId: req.user._id });

  // 404 (not 403) so other users' setup ids are not revealed
  if (!setup) throw new ApiError(404, 'Setup not found');

  req.setup = setup;
  next();
});

export { loadOwnedSetup };