import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Setup from '../models/TimeTable/setup.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import SetupCopy from '../models/Sharing/setupCopy.model.js';
import { buildSnapshot } from '../services/sharing.service.js';
import { normalizeScopePart } from '../utils/scopeKey.js';

const collegeKeyOf = (user) => (user.college ? normalizeScopePart(user.college) : null);

const SORT_OPTIONS = {
  rank: { rankScore: -1, ratingAverage: -1, usedByCount: -1 },
  popular: { usedByCount: -1, ratingAverage: -1 },
  rating: { ratingAverage: -1, ratingCount: -1 },
  new: { publishedAt: -1 },
};

// Fields safe to show other students. Never exposes publisher email or attendance
const PUBLIC_FIELDS =
  'title description collegeId branch semesterLabel academicYear section subjectCount ' +
  'subjectNames usedByCount ratingAverage ratingCount isVerified publishedAt ' +
  'snapshotUpdatedAt publisherId';

const publishSetup = asyncHandler(async (req, res) => {
  const setup = req.setup;

  if (setup.status !== 'active') {
    throw new ApiError(409, 'Only active setups can be published');
  }
  if (setup.sourcePublicationId) {
    throw new ApiError(409, 'A setup copied from a shared setup cannot be published');
  }
  if (await SharedPublication.exists({ sourceSetupId: setup._id, status: 'published' })) {
    throw new ApiError(409, 'This setup is already published. Refresh the listing instead');
  }

  // Always taken from the profile, never from the request, so nobody can publish into another college
  const collegeId = collegeKeyOf(req.user);
  if (!collegeId) throw new ApiError(400, 'Your profile has no college, so you cannot publish');

  const snapshot = await buildSnapshot(setup);
  if (!snapshot.subjects.length || !snapshot.recurringRules.length) {
    throw new ApiError(400, 'Add subjects and recurring classes before publishing');
  }

  const now = new Date();
  const publication = await SharedPublication.create({
    publisherId: req.user._id,
    sourceSetupId: setup._id,
    title: req.body.title ?? setup.name,
    description: req.body.description,
    collegeId,
    branch: setup.branch,
    semesterLabel: setup.semesterLabel,
    academicYear: setup.academicYear,
    section: setup.section,
    subjectCount: snapshot.subjects.length,
    subjectNames: snapshot.subjects.map((s) => s.name),
    snapshot,
    publishedAt: now,
    snapshotUpdatedAt: now,
  });

  await Setup.updateOne({ _id: setup._id }, { $set: { publishedAs: publication._id } });

  publication.snapshot = undefined;

  return res
    .status(201)
    .json(new ApiResponse(201, { publication }, 'Setup published successfully'));
});
// Re-reads the publisher's setup. Only affects people who copy it from now on
const refreshPublication = asyncHandler(async (req, res) => {
  const publication = await SharedPublication.findOne({
    _id: req.params.publicationId,
    publisherId: req.user._id,
    status: 'published',
  });
  if (!publication) throw new ApiError(404, 'Publication not found');

  const setup =
    publication.sourceSetupId &&
    (await Setup.findOne({ _id: publication.sourceSetupId, ownerId: req.user._id }));
  if (!setup) {
    throw new ApiError(409, 'The source setup no longer exists, so this listing cannot be refreshed');
  }

  const snapshot = await buildSnapshot(setup);
  if (!snapshot.subjects.length || !snapshot.recurringRules.length) {
    throw new ApiError(400, 'Add subjects and recurring classes before refreshing');
  }

  const updated = await SharedPublication.findOneAndUpdate(
    { _id: publication._id },
    {
      $set: {
        snapshot,
        subjectCount: snapshot.subjects.length,
        subjectNames: snapshot.subjects.map((s) => s.name),
        snapshotUpdatedAt: new Date(),
      },
    },
    { new: true }
  ).select(PUBLIC_FIELDS);

  return res
    .status(200)
    .json(new ApiResponse(200, { publication: updated }, 'Listing refreshed'));
});

const listPublications = asyncHandler(async (req, res) => {
  const { q, branch, semesterLabel, academicYear, collegeId, sort, page, limit } =
    req.validatedQuery;

  // Students see their own college unless they ask for another one
  const filter = {
    status: 'published',
    collegeId: collegeId ?? collegeKeyOf(req.user),
  };
  if (!filter.collegeId) delete filter.collegeId;
  if (branch) filter.branch = branch;
  if (semesterLabel) filter.semesterLabel = semesterLabel;
  if (academicYear) filter.academicYear = academicYear;
  if (q) filter.$text = { $search: q };

  const [publications, total] = await Promise.all([
    SharedPublication.find(filter)
      .select(PUBLIC_FIELDS)
      .populate('publisherId', 'displayName')
      .sort(SORT_OPTIONS[sort])
      .skip((page - 1) * limit)
      .limit(limit),
    SharedPublication.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { publications, page, limit, total, totalPages: Math.ceil(total / limit) },
      'Publications fetched successfully'
    )
  );
});

const getMyPublications = asyncHandler(async (req, res) => {
  const publications = await SharedPublication.find({ publisherId: req.user._id }).sort({
    createdAt: -1,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, { publications }, 'Your publications fetched successfully'));
});

// Includes the snapshot so a student can preview subjects and timings before copying
const getPublicationById = asyncHandler(async (req, res) => {
  const publication = await SharedPublication.findOne({
    _id: req.params.publicationId,
    // Unpublished listings stay visible to their publisher only
    $or: [{ status: 'published' }, { publisherId: req.user._id }],
  })
    .select(`${PUBLIC_FIELDS} status +snapshot`)
    .populate('publisherId', 'displayName');
  if (!publication) throw new ApiError(404, 'Publication not found');

  const myCopy = await SetupCopy.findOne({
    userId: req.user._id,
    publicationId: publication._id,
  }).select('localSetupId rating');

  return res
    .status(200)
    .json(new ApiResponse(200, { publication, myCopy }, 'Publication fetched successfully'));
});

const unpublishPublication = asyncHandler(async (req, res) => {
  const publication = await SharedPublication.findOneAndUpdate(
    { _id: req.params.publicationId, publisherId: req.user._id, status: 'published' },
    { $set: { status: 'unpublished' } },
    { new: true }
  );
  if (!publication) throw new ApiError(404, 'Published listing not found');

  // Existing copies are independent and stay untouched
  if (publication.sourceSetupId) {
    await Setup.updateOne(
      { _id: publication.sourceSetupId, publishedAs: publication._id },
      { $set: { publishedAs: null } }
    );
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { publication }, 'Publication unpublished'));
});

export {
  publishSetup,
  refreshPublication,
  listPublications,
  getMyPublications,
  getPublicationById,
  unpublishPublication,
};