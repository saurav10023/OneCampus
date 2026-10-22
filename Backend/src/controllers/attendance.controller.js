import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { getAttendance, checkBunk, stripInternal } from '../services/attendance.service.js';

// All three are read-only, so they also work on an archived setup.

const getOverview = asyncHandler(async (req, res) => {
  const { includeArchived } = req.validatedQuery;
  const data = await getAttendance({ setup: req.setup, userId: req.user._id, includeArchived });
  return res
    .status(200)
    .json(new ApiResponse(200, stripInternal(data), 'Attendance fetched successfully'));
});

const getSubjectAttendance = asyncHandler(async (req, res) => {
  const { subjectId } = req.params;
  if (!mongoose.isValidObjectId(subjectId)) throw new ApiError(400, 'Invalid subjectId');

  const data = await getAttendance({ setup: req.setup, userId: req.user._id, includeArchived: true });
  const subject = data.subjects.find((s) => String(s.subject.id) === subjectId);
  if (!subject) throw new ApiError(404, 'Subject not found');

  return res
    .status(200)
    .json(new ApiResponse(200, { asOf: data.asOf, ...subject }, 'Subject attendance fetched successfully'));
});

const getBunkCheck = asyncHandler(async (req, res) => {
  const { count, subjectId, includeArchived } = req.validatedQuery;
  const result = await checkBunk({
    setup: req.setup,
    userId: req.user._id,
    count,
    subjectId,
    includeArchived,
  });
  if (!result) throw new ApiError(404, 'Subject not found');

  return res.status(200).json(new ApiResponse(200, result, 'Bunk check completed'));
});

export { getOverview, getSubjectAttendance, getBunkCheck };