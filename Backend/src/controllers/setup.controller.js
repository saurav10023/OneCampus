import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { formatDateOnly } from '../utils/date.util.js';
import Setup from '../models/TimeTable/setup.model.js';
import { User } from '../models/user.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import {
  applyStartDateChange,
  applyEndDateChange,
  updateSetupDetails,
  getDeleteImpact,
  deleteSetupWithChildren,
} from '../services/setup.service.js';

// Only these fields can be set when a student creates a setup. ownerId comes from the token;
// scopeKey is computed; status, the official link and the sharing fields are never client input.
const CREATE_FIELDS = [
  'name',
  'academicYear',
  'semesterLabel',
  'branch',
  'section',
  'startDate',
  'endDate',
  'timezone',
  'targetPercentage',
];

const pick = (source, keys) =>
  Object.fromEntries(
    keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]])
  );

const duplicateScopeError = () =>
  new ApiError(409, 'You already have an active setup for this year, semester, branch and section');

// Tells the student how many classes a range growth cancelled because of a holiday or exam
const pushEventCancellationWarning = (warnings, eventCancellation) => {
  if (eventCancellation?.cancelled) {
    warnings.push(
      `${eventCancellation.cancelled} class(es) fall on a holiday, break or exam in your calendar ` +
        'and were marked "Cancelled" (not counted).'
    );
  }
};

const createSetup = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { archivePrevious } = req.body ?? {};
  if (archivePrevious !== undefined && typeof archivePrevious !== 'boolean') {
    throw new ApiError(400, 'archivePrevious must be true or false');
  }

  // ownerId always comes from the token, never from the body
  const setup = new Setup({ ...pick(req.body, CREATE_FIELDS), ownerId: userId });
  // Validates and computes scopeKey before anything is written
  await setup.validate();

  // One active setup per scope. A student with one already is asked whether to archive it.
  const previous = await Setup.findOne({
    ownerId: userId,
    scopeKey: setup.scopeKey,
    status: 'active',
  });
  if (previous) {
    if (archivePrevious !== true) {
      throw new ApiError(409, 'You already have an active setup for this year, semester, branch and section', [
        `Send archivePrevious: true to archive "${previous.name}" and create this one.`,
      ]);
    }
    previous.status = 'archived';
    await previous.save();
  }

  try {
    await setup.save();
  } catch (err) {
    // Put the earlier setup back so a failed create changes nothing
    if (previous) {
      previous.status = 'active';
      await previous.save().catch(() => {});
    }
    if (err?.code === 11000) throw duplicateScopeError();
    throw err;
  }

  // The newest setup becomes the active one
  await User.updateOne({ _id: userId }, { $set: { activeSetupId: setup._id } });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { setup, archivedSetupId: previous ? previous._id : null },
        'Setup created successfully'
      )
    );
});

const getMySetups = asyncHandler(async (req, res) => {
  const filter = { ownerId: req.user._id };
  if (['active', 'archived'].includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const setups = await Setup.find(filter).sort({ createdAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { setups }, 'Setups fetched successfully'));
});

const getSetupById = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, { setup: req.setup }, 'Setup fetched successfully'));
});

const updateSetup = asyncHandler(async (req, res) => {
  const setup = req.setup;

  // Archived setups are read-only (open decision in the blueprint; revisit if needed)
  if (setup.status === 'archived') {
    throw new ApiError(409, 'Archived setups are read-only');
  }

  const { startDate, endDate, leaveOfficial, ...rest } = req.body;
  if (leaveOfficial !== undefined && typeof leaveOfficial !== 'boolean') {
    throw new ApiError(400, 'leaveOfficial must be true or false');
  }
  const oldStart = setup.startDate;
  const oldEnd = setup.endDate;

  // Check the final range up front, before anything touches occurrences
  if ((startDate ?? oldStart) > (endDate ?? oldEnd)) {
    throw new ApiError(400, 'startDate must be on or before endDate');
  }

  // Name, scope, target and timezone first, through save() so scopeKey is recomputed.
  // Doing this before the date changes means a refusal (joined setup, duplicate scope)
  // stops the request before any class is touched.
  try {
    await updateSetupDetails(setup, rest, { leaveOfficial: leaveOfficial === true });
  } catch (err) {
    if (err?.code === 11000) throw duplicateScopeError();
    throw err;
  }

  const warnings = [];
  const userId = req.user._id;

  if (startDate && startDate.getTime() !== oldStart.getTime()) {
    const { affected, restored, eventCancellation } = await applyStartDateChange(
      setup,
      startDate,
      oldStart,
      userId
    );
    setup.startDate = startDate;

    if (startDate > oldStart && affected) {
      warnings.push(
        `${affected} class(es) before ${formatDateOnly(startDate)} are now "Not Counted" ` +
          'and excluded from your attendance percentage.'
      );
    }
    if (startDate < oldStart && affected) {
      warnings.push(
        `${affected} new class(es) from ${formatDateOnly(startDate)} were added as ` +
          '"Not Counted" so they do not change your attendance percentage.'
      );
    }
    if (restored) {
      warnings.push(`${restored} previously uncounted class(es) were restored.`);
    }
    pushEventCancellationWarning(warnings, eventCancellation);
  }

  if (endDate && endDate.getTime() !== oldEnd.getTime()) {
    const { affected, restored, eventCancellation } = await applyEndDateChange(
      setup,
      endDate,
      oldEnd,
      userId
    );
    setup.endDate = endDate;

    if (endDate > oldEnd && affected) {
      warnings.push(
        `${affected} new class(es) up to ${formatDateOnly(endDate)} were added as ` +
          '"Absent". Update them as you attend, or your attendance percentage will drop.'
      );
    }
    if (endDate < oldEnd && affected) {
      warnings.push(
        `${affected} class(es) after ${formatDateOnly(endDate)} are now "Not Counted" ` +
          'and excluded from your attendance percentage.'
      );
    }
    if (restored) {
      warnings.push(`${restored} previously uncounted class(es) were restored.`);
    }
    pushEventCancellationWarning(warnings, eventCancellation);
  }

  await setup.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { setup, warnings }, 'Setup updated successfully'));
});

const archiveSetup = asyncHandler(async (req, res) => {
  const setup = req.setup;

  setup.status = 'archived';
  await setup.save();

  // Clear the pointer only if it still targets this setup
  await User.updateOne(
    { _id: req.user._id, activeSetupId: setup._id },
    { $unset: { activeSetupId: 1 } }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, { setup }, 'Setup archived successfully'));
});

const setActiveSetup = asyncHandler(async (req, res) => {
  if (req.setup.status !== 'active') {
    throw new ApiError(409, 'Archived setups cannot be made active');
  }

  await User.updateOne(
    { _id: req.user._id },
    { $set: { activeSetupId: req.setup._id } }
  );

  return res
    .status(200)
    .json(
      new ApiResponse(200, { activeSetupId: req.setup._id }, 'Active setup updated')
    );
});

// Read-only preview so the client can show exactly what a delete would destroy
const getSetupDeleteImpact = asyncHandler(async (req, res) => {
  const impact = await getDeleteImpact(req.setup, req.user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, { impact }, 'Delete impact fetched successfully'));
});

const deleteSetup = asyncHandler(async (req, res) => {
  const setup = req.setup;

  // Typed confirmation guards against accidental permanent deletion
  if (req.body?.confirmName !== setup.name) {
    throw new ApiError(400, 'Confirmation failed', [
      'confirmName must exactly match the setup name',
    ]);
  }

  // REMOVE alsoUnpublish and the publication check in the sharing cut-over (lifecycle Section 5)
  const { alsoUnpublish } = req.body;
  if (alsoUnpublish !== undefined && typeof alsoUnpublish !== 'boolean') {
    throw new ApiError(400, 'alsoUnpublish must be true or false');
  }

  // A live publication needs an explicit decision, never a silent default
  const publication = await SharedPublication.findOne({
    sourceSetupId: setup._id,
    status: 'published',
  }).select('title adoptionCount');

  if (publication && alsoUnpublish === undefined) {
    throw new ApiError(409, 'This setup is published. Choose what happens to the publication.', [
      `alsoUnpublish: true takes "${publication.title}" down. Its ${publication.adoptionCount} adopter(s) keep their copies.`,
      'alsoUnpublish: false keeps it listed, but it can no longer receive new versions.',
    ]);
  }

  const summary = await deleteSetupWithChildren(setup, req.user._id, {
    alsoUnpublish: alsoUnpublish === true,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { summary }, 'Setup and all its data deleted permanently'));
});

export {
  createSetup,
  getMySetups,
  getSetupById,
  updateSetup,
  archiveSetup,
  setActiveSetup,
  getSetupDeleteImpact,
  deleteSetup,
};