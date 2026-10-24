import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  listJoinableSchedules,
  getOfficialStatus,
  previewJoin,
  joinSchedule,
  leaveSchedule,
} from '../services/officialJoin.service.js';

// Thin handlers. req.setup is the caller's own setup (loadSetup), so the service never has to
// check ownership. Archived setups are refused inside the service.

const status = asyncHandler(async (req, res) => {
  const result = await getOfficialStatus({ user: req.user, setup: req.setup });
  return res.status(200).json(new ApiResponse(200, result, 'Official status fetched successfully'));
});

const schedules = asyncHandler(async (req, res) => {
  const result = await listJoinableSchedules({ user: req.user, setup: req.setup });
  return res.status(200).json(new ApiResponse(200, result, 'Schedules fetched successfully'));
});

const preview = asyncHandler(async (req, res) => {
  const result = await previewJoin({ user: req.user, setup: req.setup, input: req.body });
  return res.status(200).json(new ApiResponse(200, { preview: result }, 'Join preview fetched successfully'));
});

const join = asyncHandler(async (req, res) => {
  const result = await joinSchedule({ user: req.user, setup: req.setup, input: req.body });
  return res.status(200).json(new ApiResponse(200, result, 'Joined the official schedule'));
});

const leave = asyncHandler(async (req, res) => {
  const result = await leaveSchedule({ setup: req.setup });
  return res.status(200).json(new ApiResponse(200, result, 'Left the official schedule'));
});

export { status, schedules, preview, join, leave };