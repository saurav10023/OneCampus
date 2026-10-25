import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  markRead,
  markAllRead,
  acceptUpdate,
  dismissUpdate,
  listOptOuts,
  restoreOptOut,
  detachRule,
  reattachRule,
  detachSubject,
  reattachSubject,
} from '../services/officialUpdate.service.js';

// Thin handlers. req.setup is the caller's own setup (loadSetup); the services scope every lookup
// to it, so another student's records are never reachable.

const send = (res, data, message) => res.status(200).json(new ApiResponse(200, data, message));

const read = asyncHandler(async (req, res) =>
  send(res, await markRead({ setup: req.setup, updateId: req.params.updateId }), 'Update marked as read'));

const readAll = asyncHandler(async (req, res) =>
  send(res, await markAllRead({ setup: req.setup }), 'All updates marked as read'));

const accept = asyncHandler(async (req, res) =>
  send(
    res,
    await acceptUpdate({
      setup: req.setup,
      userId: req.user._id,
      updateId: req.params.updateId,
      confirm: req.body.confirm,
      confirmOverlap: req.body.confirmOverlap,
    }),
    'Update accepted'
  ));

const dismiss = asyncHandler(async (req, res) =>
  send(res, await dismissUpdate({ setup: req.setup, updateId: req.params.updateId }), 'Update dismissed'));

const optOuts = asyncHandler(async (req, res) =>
  send(res, await listOptOuts({ setup: req.setup }), 'Hidden official items fetched successfully'));

const restore = asyncHandler(async (req, res) =>
  send(res, await restoreOptOut({ setup: req.setup, kind: req.params.kind, id: req.params.id }), 'Official item restored'));

const ruleDetach = asyncHandler(async (req, res) =>
  send(res, await detachRule({ setup: req.setup, ruleId: req.params.ruleId }), 'Class detached from the official schedule'));

const ruleReattach = asyncHandler(async (req, res) =>
  send(res, await reattachRule({ setup: req.setup, ruleId: req.params.ruleId }), 'Class re-attached to the official schedule'));

const subjectDetach = asyncHandler(async (req, res) =>
  send(res, await detachSubject({ setup: req.setup, subjectId: req.params.subjectId }), 'Subject detached from the official schedule'));

const subjectReattach = asyncHandler(async (req, res) =>
  send(
    res,
    await reattachSubject({ setup: req.setup, subjectId: req.params.subjectId, confirm: req.body.confirm }),
    'Subject re-attached to the official schedule'
  ));

export { read, readAll, accept, dismiss, optOuts, restore, ruleDetach, ruleReattach, subjectDetach, subjectReattach };