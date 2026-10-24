import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  listItems,
  getItem,
  createItem,
  bulkCreateItems,
  updateItem,
  withdrawItem,
  restoreItem,
} from '../services/scheduleItem.Service.js';

// All handlers read :scheduleId (and :itemId) from the mount path. The service checks the caller's
// ScheduleRole for that schedule, so nothing here trusts the request for permission.

// GET /
const list = asyncHandler(async (req, res) => {
  const items = await listItems({
    user: req.user,
    scheduleId: req.params.scheduleId,
    query: req.validatedQuery,
  });
  return res.status(200).json(new ApiResponse(200, { items, count: items.length }, 'Items fetched successfully'));
});

// GET /:itemId
const get = asyncHandler(async (req, res) => {
  const result = await getItem({
    user: req.user,
    scheduleId: req.params.scheduleId,
    itemId: req.params.itemId,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Item fetched successfully'));
});

// POST /
const create = asyncHandler(async (req, res) => {
  const result = await createItem({ user: req.user, scheduleId: req.params.scheduleId, input: req.body });
  return res.status(201).json(new ApiResponse(201, result, 'Item added'));
});

// POST /bulk
const bulkCreate = asyncHandler(async (req, res) => {
  const result = await bulkCreateItems({
    user: req.user,
    scheduleId: req.params.scheduleId,
    items: req.body.items,
    note: req.body.note,
  });
  return res.status(201).json(new ApiResponse(201, result, `${result.count} item(s) added`));
});

// PATCH /:itemId
const update = asyncHandler(async (req, res) => {
  const result = await updateItem({
    user: req.user,
    scheduleId: req.params.scheduleId,
    itemId: req.params.itemId,
    input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, result.changed ? 'Item updated' : 'Nothing changed'));
});

// POST /:itemId/withdraw
const withdraw = asyncHandler(async (req, res) => {
  const result = await withdrawItem({
    user: req.user,
    scheduleId: req.params.scheduleId,
    itemId: req.params.itemId,
    note: req.body.note,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Item withdrawn'));
});

// POST /:itemId/restore
const restore = asyncHandler(async (req, res) => {
  const result = await restoreItem({
    user: req.user,
    scheduleId: req.params.scheduleId,
    itemId: req.params.itemId,
    note: req.body.note,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Item restored'));
});

export { list, get, create, bulkCreate, update, withdraw, restore };