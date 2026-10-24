import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  listRules,
  getRule,
  createRule,
  updateRule,
  withdrawRule,
  restoreRule,
} from '../services/scheduleRule.service.js';

// Thin handlers: the service checks who the caller is, what the schedule allows and what is saved.

const idParam = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw new ApiError(404, `${label} not found`);
  return value;
};
const scheduleIdOf = (req) => idParam(req.params.scheduleId, 'Schedule');
const ruleIdOf = (req) => idParam(req.params.ruleId, 'Class');

const list = asyncHandler(async (req, res) => {
  const result = await listRules({ user: req.user, scheduleId: scheduleIdOf(req), query: req.validatedQuery });
  return res.status(200).json(new ApiResponse(200, result, 'Classes fetched successfully'));
});

const get = asyncHandler(async (req, res) => {
  const result = await getRule({ user: req.user, scheduleId: scheduleIdOf(req), ruleId: ruleIdOf(req) });
  return res.status(200).json(new ApiResponse(200, result, 'Class fetched successfully'));
});

const create = asyncHandler(async (req, res) => {
  const result = await createRule({ user: req.user, scheduleId: scheduleIdOf(req), input: req.body });
  return res.status(201).json(new ApiResponse(201, result, 'Class added'));
});

const update = asyncHandler(async (req, res) => {
  const result = await updateRule({
    user: req.user, scheduleId: scheduleIdOf(req), ruleId: ruleIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, result.changed ? 'Class updated' : 'Nothing changed'));
});

const withdraw = asyncHandler(async (req, res) => {
  const result = await withdrawRule({
    user: req.user, scheduleId: scheduleIdOf(req), ruleId: ruleIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Class withdrawn'));
});

const restore = asyncHandler(async (req, res) => {
  const result = await restoreRule({
    user: req.user, scheduleId: scheduleIdOf(req), ruleId: ruleIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Class restored'));
});

export { list, get, create, update, withdraw, restore };