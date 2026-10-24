import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { listActions, getAction, undoAction, redoAction, revertAction } from '../services/scheduleUndo.service.js';
import { previewImpact } from '../services/scheduleImpact.service.js';

// All handlers read :scheduleId (and :actionId) from the mount path. The services check the caller's
// ScheduleRole for that schedule, so nothing here trusts the request for permission.

// GET /
const list = asyncHandler(async (req, res) => {
  const result = await listActions({ user: req.user, scheduleId: req.params.scheduleId, query: req.validatedQuery });
  return res.status(200).json(new ApiResponse(200, result, 'Actions fetched successfully'));
});

// GET /:actionId
const get = asyncHandler(async (req, res) => {
  const result = await getAction({ user: req.user, scheduleId: req.params.scheduleId, actionId: req.params.actionId });
  return res.status(200).json(new ApiResponse(200, result, 'Action fetched successfully'));
});

const reversal = (run, message) =>
  asyncHandler(async (req, res) => {
    const result = await run({
      user: req.user,
      scheduleId: req.params.scheduleId,
      actionId: req.params.actionId,
      note: req.body.note,
    });
    return res.status(200).json(new ApiResponse(200, result, message));
  });

// POST /:actionId/undo
const undo = reversal(undoAction, 'Action undone');
// POST /:actionId/redo   (on an action whose op is "undo")
const redo = reversal(redoAction, 'Action redone');
// POST /:actionId/revert   (college admin only)
const revert = reversal(revertAction, 'Action reverted');

// POST /impact-preview
const impact = asyncHandler(async (req, res) => {
  const result = await previewImpact({ user: req.user, scheduleId: req.params.scheduleId, input: req.body });
  return res.status(200).json(new ApiResponse(200, result, 'Impact calculated'));
});

export { list, get, undo, redo, revert, impact };