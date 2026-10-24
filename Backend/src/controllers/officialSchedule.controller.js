import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  createSchedule,
  listSchedules,
  getSchedule,
  updateSchedule,
  publishSchedule,
  unpublishSchedule,
  archiveSchedule,
} from '../services/officialSchedule.service.js';

// POST /
const createDraftSchedule = asyncHandler(async (req, res) => {
  const result = await createSchedule({ user: req.user, input: req.body });
  return res.status(201).json(new ApiResponse(201, result, 'Draft schedule created'));
});

// GET /
const getSchedules = asyncHandler(async (req, res) => {
  const schedules = await listSchedules({ user: req.user, query: req.validatedQuery });
  return res
    .status(200)
    .json(new ApiResponse(200, { schedules, count: schedules.length }, 'Schedules fetched successfully'));
});

// GET /:scheduleId
const getOneSchedule = asyncHandler(async (req, res) => {
  const result = await getSchedule({ user: req.user, scheduleId: req.params.scheduleId });
  return res.status(200).json(new ApiResponse(200, result, 'Schedule fetched successfully'));
});

// PATCH /:scheduleId
const editSchedule = asyncHandler(async (req, res) => {
  const result = await updateSchedule({ user: req.user, scheduleId: req.params.scheduleId, input: req.body });
  return res.status(200).json(new ApiResponse(200, result, result.changed ? 'Schedule updated' : 'Nothing changed'));
});

// POST /:scheduleId/publish
const publish = asyncHandler(async (req, res) => {
  const result = await publishSchedule({ user: req.user, scheduleId: req.params.scheduleId, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, result, 'Schedule published'));
});

// POST /:scheduleId/unpublish
const unpublish = asyncHandler(async (req, res) => {
  const result = await unpublishSchedule({ user: req.user, scheduleId: req.params.scheduleId, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, result, 'Schedule moved back to a draft'));
});

// POST /:scheduleId/archive
const archive = asyncHandler(async (req, res) => {
  const result = await archiveSchedule({ user: req.user, scheduleId: req.params.scheduleId, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, result, 'Schedule archived'));
});

export { createDraftSchedule, getSchedules, getOneSchedule, editSchedule, publish, unpublish, archive };