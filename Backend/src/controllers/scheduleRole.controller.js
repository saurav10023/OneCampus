import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  requestRole,
  listMyRoles,
  withdrawRole,
  listRoleRequests,
  approveRole,
  rejectRole,
  revokeRole,
} from '../services/scheduleRole.service.js';

// POST /   a student asks to be the CR of a class
const createRoleRequest = asyncHandler(async (req, res) => {
  const role = await requestRole({ user: req.user, input: req.body });
  return res.status(201).json(new ApiResponse(201, { role }, 'Request sent. An admin will review it.'));
});

// GET /mine
const getMyRoles = asyncHandler(async (req, res) => {
  const roles = await listMyRoles(req.user._id);
  return res.status(200).json(new ApiResponse(200, { roles, count: roles.length }, 'Roles fetched successfully'));
});

// GET /requests   admin only
const getRoleRequests = asyncHandler(async (req, res) => {
  const roles = await listRoleRequests({ adminUserId: req.user._id, query: req.validatedQuery });
  return res.status(200).json(new ApiResponse(200, { roles, count: roles.length }, 'Requests fetched successfully'));
});

const approveRoleRequest = asyncHandler(async (req, res) => {
  const role = await approveRole({ roleId: req.params.roleId, adminUserId: req.user._id, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, { role }, 'Request approved'));
});

const rejectRoleRequest = asyncHandler(async (req, res) => {
  const role = await rejectRole({ roleId: req.params.roleId, adminUserId: req.user._id, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, { role }, 'Request rejected'));
});

const revokeActiveRole = asyncHandler(async (req, res) => {
  const role = await revokeRole({ roleId: req.params.roleId, adminUserId: req.user._id, note: req.body.note });
  return res.status(200).json(new ApiResponse(200, { role }, 'Role revoked'));
});

// PATCH /:roleId/withdraw   the owner cancels a pending request or gives up their own role
const withdrawOwnRole = asyncHandler(async (req, res) => {
  const role = await withdrawRole({ roleId: req.params.roleId, userId: req.user._id });
  return res.status(200).json(new ApiResponse(200, { role }, 'Role withdrawn'));
});

export {
  createRoleRequest,
  getMyRoles,
  getRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
  revokeActiveRole,
  withdrawOwnRole,
};