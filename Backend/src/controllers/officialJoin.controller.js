import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { normalizeScopePart } from '../utils/scopeKey.js';
import { semesterMatches } from '../utils/semester.js';
import {
  listJoinableSchedules,
  getOfficialStatus,
  previewJoin,
  joinSchedule,
  leaveSchedule,
} from '../services/officialJoin.service.js';

// A schedule is shown only if year, semester, branch and section all match the setup.
const matchesSetup = (setup, s) =>
  s.academicYear === setup.academicYear &&
  semesterMatches(setup.semesterLabel, s.semesterLabel) &&
  normalizeScopePart(s.branch ?? '') === normalizeScopePart(setup.branch ?? '') &&
  normalizeScopePart(s.section ?? '') === normalizeScopePart(setup.section ?? '');

const status = asyncHandler(async (req, res) => {
  const result = await getOfficialStatus({ user: req.user, setup: req.setup });
  return res.status(200).json(new ApiResponse(200, result, 'Official status fetched successfully'));
});

const schedules = asyncHandler(async (req, res) => {
  const result = await listJoinableSchedules({ user: req.user, setup: req.setup });

  const matching = result.schedules
    .filter((s) => matchesSetup(req.setup, s))
    .map((s) => ({
      id: s.id,
      academicYear: s.academicYear,
      semesterLabel: s.semesterLabel,
      branch: s.branch,
      section: s.section,
      groups: s.groups,
      semesterStart: s.semesterStart,
      semesterEnd: s.semesterEnd,
      subjectCount: s.subjectCount,
      classCount: s.classCount,
    }));

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { alreadyJoined: result.alreadyJoined, schedules: matching, count: matching.length },
        'Schedules fetched successfully'
      )
    );
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