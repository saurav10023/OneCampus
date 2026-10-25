import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { getRollout } from '../services/scheduleRollout.service.js';

const rollout = asyncHandler(async (req, res) => {
  const { scheduleId } = req.params;
  if (!mongoose.isValidObjectId(scheduleId)) throw new ApiError(404, 'Schedule not found');
  const result = await getRollout({ user: req.user, scheduleId });
  return res.status(200).json(new ApiResponse(200, result, 'Rollout fetched successfully'));
});

export { rollout };