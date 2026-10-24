import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
  withdrawSubject,
  restoreSubject,
} from '../services/scheduleSubject.service.js';

// Thin handlers: the service checks who the caller is, what the schedule allows and what is saved.

const idParam = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw new ApiError(404, `${label} not found`);
  return value;
};
const scheduleIdOf = (req) => idParam(req.params.scheduleId, 'Schedule');
const subjectIdOf = (req) => idParam(req.params.subjectId, 'Subject');

const list = asyncHandler(async (req, res) => {
  const result = await listSubjects({ user: req.user, scheduleId: scheduleIdOf(req), query: req.validatedQuery });
  return res.status(200).json(new ApiResponse(200, result, 'Subjects fetched successfully'));
});

const get = asyncHandler(async (req, res) => {
  const result = await getSubject({ user: req.user, scheduleId: scheduleIdOf(req), subjectId: subjectIdOf(req) });
  return res.status(200).json(new ApiResponse(200, result, 'Subject fetched successfully'));
});

const create = asyncHandler(async (req, res) => {
  const result = await createSubject({ user: req.user, scheduleId: scheduleIdOf(req), input: req.body });
  return res.status(201).json(new ApiResponse(201, result, 'Subject added'));
});

const update = asyncHandler(async (req, res) => {
  const result = await updateSubject({
    user: req.user, scheduleId: scheduleIdOf(req), subjectId: subjectIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, result.changed ? 'Subject updated' : 'Nothing changed'));
});

const withdraw = asyncHandler(async (req, res) => {
  const result = await withdrawSubject({
    user: req.user, scheduleId: scheduleIdOf(req), subjectId: subjectIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Subject withdrawn'));
});

const restore = asyncHandler(async (req, res) => {
  const result = await restoreSubject({
    user: req.user, scheduleId: scheduleIdOf(req), subjectId: subjectIdOf(req), input: req.body,
  });
  return res.status(200).json(new ApiResponse(200, result, 'Subject restored'));
});

export { list, get, create, update, withdraw, restore };