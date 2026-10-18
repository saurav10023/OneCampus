import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import SetupVersion from '../models/Sharing/setupVersion.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import SharedAdoption from '../models/Sharing/sharedAdoption.model.js';
import { createSetupFromSnapshot, applyRatingDelta } from '../services/sharing.service.js';
import { purgeSetupData } from '../services/setup.service.js';
import { ATTENDANCE_STATUS, MIN_RECORDED_CLASSES_TO_RATE } from '../utils/constants.js';
import { User } from '../models/user.model.js';

const adoptPublication = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const publication = await SharedPublication.findOne({
    _id: req.params.publicationId,
    status: 'published',
  });
  if (!publication) throw new ApiError(404, 'Publication not found');

  // "Used by" counts other students only
  if (String(publication.publisherId) === String(userId)) {
    throw new ApiError(400, 'You cannot adopt your own publication');
  }
  if (req.user.collegeId && String(req.user.collegeId) !== publication.collegeId) {
    throw new ApiError(403, 'This publication belongs to a different college');
  }

  const version = await SetupVersion.findOne({
    publicationId: publication._id,
    versionNumber: publication.publicationVersion,
  });
  if (!version) throw new ApiError(500, 'Published version is missing');

  // Claim the adoption first: the unique index rejects a double adoption before any copying
  const localSetupId = new mongoose.Types.ObjectId();
  let adoption;
  try {
    adoption = await SharedAdoption.create({
      userId,
      publicationId: publication._id,
      localSetupId,
      adoptedVersionNumber: version.versionNumber,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'You have already adopted this publication');
    }
    throw error;
  }

  try {
    const setup = await createSetupFromSnapshot({
      snapshot: version.snapshot,
      ownerId: userId,
      setupId: localSetupId,
      publicationId: publication._id,
      versionNumber: version.versionNumber,
    });

    // Only when they have none; adopting must not silently switch their current setup
    await User.updateOne({ _id: userId, activeSetupId: null }, { $set: { activeSetupId: setup._id } });

    // Counters last, so a rollback never has to undo them
    await SharedPublication.updateOne(
      { _id: publication._id },
      {
        $inc: { adoptionCount: 1, totalAdoptionCount: 1, latestVersionAdopterCount: 1 },
        $set: { lastAdoptedAt: new Date() },
      }
    );

    return res
      .status(201)
      .json(new ApiResponse(201, { setup, adoption }, 'Setup adopted successfully'));
  } catch (error) {
    // Compensating cleanup: no half-built copy and no adoption row left behind
    await purgeSetupData(localSetupId);
    await SharedAdoption.deleteOne({ _id: adoption._id });
    await User.updateOne({ _id: userId, activeSetupId: localSetupId }, { $unset: { activeSetupId: 1 } });
    throw error;
  }
});

const getMyAdoptions = asyncHandler(async (req, res) => {
  const adoptions = await SharedAdoption.find({ userId: req.user._id })
    .populate('publicationId', 'title status publicationVersion adoptionCount ratingAverage ratingCount')
    .sort({ adoptedAt: -1 });

  const data = adoptions.map((adoption) => ({
    ...adoption.toObject(),
    hasUpdate:
      adoption.status === 'active' &&
      adoption.updateAvailableVersionNumber > adoption.adoptedVersionNumber,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, { adoptions: data }, 'Adoptions fetched successfully'));
});

// Keeps the local setup, stops following the shared one
const unlinkAdoption = asyncHandler(async (req, res) => {
  // The status condition makes a repeated request a no-op instead of a double decrement
  const adoption = await SharedAdoption.findOneAndUpdate(
    { _id: req.params.adoptionId, userId: req.user._id, status: 'active' },
    { $set: { status: 'unlinked', updateAvailableVersionNumber: null } },
    { new: true }
  );
  if (!adoption) throw new ApiError(404, 'Active adoption not found');

  const publication = await SharedPublication.findById(adoption.publicationId).select(
    'publicationVersion'
  );
  if (publication) {
    const inc = { adoptionCount: -1 };
    if (adoption.adoptedVersionNumber === publication.publicationVersion) {
      inc.latestVersionAdopterCount = -1;
    }
    await SharedPublication.updateOne({ _id: publication._id }, { $inc: inc });
  }

  return res.status(200).json(new ApiResponse(200, { adoption }, 'Setup unlinked'));
});

const rateAdoption = asyncHandler(async (req, res) => {
  const adoption = await SharedAdoption.findOne({
    _id: req.params.adoptionId,
    userId: req.user._id,
  });
  if (!adoption) throw new ApiError(404, 'Adoption not found');

  // Only people who actually used the setup may rate it
  const occurrenceIds = await Occurrence.distinct('_id', { setupId: adoption.localSetupId });
  const recorded = await OccurrenceStatus.countDocuments({
    userId: req.user._id,
    occurrenceId: { $in: occurrenceIds },
    status: { $in: [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT] },
    source: 'user',
  });
  if (recorded < MIN_RECORDED_CLASSES_TO_RATE) {
    throw new ApiError(
      403,
      `Mark at least ${MIN_RECORDED_CLASSES_TO_RATE} classes before rating (you have ${recorded})`
    );
  }

  // new: false returns the previous rating atomically, so edits adjust instead of double count
  const previous = await SharedAdoption.findOneAndUpdate(
    { _id: adoption._id, userId: req.user._id },
    { $set: { rating: req.body.rating, ratedAt: new Date() } },
    { new: false }
  );
  if (!previous) throw new ApiError(404, 'Adoption not found');

  if (previous.rating) {
    await applyRatingDelta(adoption.publicationId, req.body.rating - previous.rating, 0);
  } else {
    await applyRatingDelta(adoption.publicationId, req.body.rating, 1);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { rating: req.body.rating }, 'Rating saved'));
});

export { adoptPublication, getMyAdoptions, unlinkAdoption, rateAdoption };