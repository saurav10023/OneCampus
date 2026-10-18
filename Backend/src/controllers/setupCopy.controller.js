import mongoose from 'mongoose';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import {User} from '../models/user.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import SetupCopy from '../models/Sharing/setupCopy.model.js';
import { createSetupFromSnapshot, applyRatingDelta } from '../services/sharing.service.js';
import { purgeSetupData } from '../services/setup.service.js';
import { ATTENDANCE_STATUS, MIN_RECORDED_CLASSES_TO_RATE } from '../utils/constants.js';

const copyPublication = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const publication = await SharedPublication.findOne({
    _id: req.params.publicationId,
    status: 'published',
  }).select('+snapshot');
  if (!publication) throw new ApiError(404, 'Publication not found');

  // "Used by" counts other students only
  if (String(publication.publisherId) === String(userId)) {
    throw new ApiError(400, 'You cannot copy your own setup');
  }
  if (req.user.collegeId && String(req.user.collegeId) !== publication.collegeId) {
    throw new ApiError(403, 'This setup belongs to a different college');
  }

  // Claim the record first: the unique index rejects a second copy before any work is done
  const localSetupId = new mongoose.Types.ObjectId();
  let copy;
  try {
    copy = await SetupCopy.create({
      userId,
      publicationId: publication._id,
      localSetupId,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, 'You already have a copy of this setup');
    }
    throw error;
  }

  try {
    const setup = await createSetupFromSnapshot({
      snapshot: publication.snapshot,
      ownerId: userId,
      setupId: localSetupId,
      publicationId: publication._id,
    });

    // Only when they have none; copying must not silently switch their current setup
    await User.updateOne(
      { _id: userId, activeSetupId: null },
      { $set: { activeSetupId: setup._id } }
    );

    // Counter last, so a rollback never has to undo it
    await SharedPublication.updateOne(
      { _id: publication._id },
      { $inc: { usedByCount: 1 }, $set: { lastCopiedAt: new Date() } }
    );

    return res
      .status(201)
      .json(new ApiResponse(201, { setup }, 'Setup copied. It is yours to edit'));
  } catch (error) {
    // Compensating cleanup: no half-built copy and no record left behind
    await purgeSetupData(localSetupId);
    await SetupCopy.deleteOne({ _id: copy._id });
    await User.updateOne(
      { _id: userId, activeSetupId: localSetupId },
      { $unset: { activeSetupId: 1 } }
    );
    throw error;
  }
});

const getMyCopies = asyncHandler(async (req, res) => {
  const copies = await SetupCopy.find({ userId: req.user._id })
    .populate('publicationId', 'title status usedByCount ratingAverage ratingCount')
    .sort({ copiedAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { copies }, 'Copies fetched successfully'));
});

const rateCopy = asyncHandler(async (req, res) => {
  const copy = await SetupCopy.findOne({
    _id: req.params.copyId,
    userId: req.user._id,
  });
  if (!copy) throw new ApiError(404, 'Copy not found');

  // Only people who actually used the setup may rate it
  const occurrenceIds = await Occurrence.distinct('_id', { setupId: copy.localSetupId });
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
  const previous = await SetupCopy.findOneAndUpdate(
    { _id: copy._id, userId: req.user._id },
    { $set: { rating: req.body.rating, ratedAt: new Date() } },
    { new: false }
  );
  if (!previous) throw new ApiError(404, 'Copy not found');

  if (previous.rating) {
    await applyRatingDelta(copy.publicationId, req.body.rating - previous.rating, 0);
  } else {
    await applyRatingDelta(copy.publicationId, req.body.rating, 1);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { rating: req.body.rating }, 'Rating saved'));
});

export { copyPublication, getMyCopies, rateCopy };