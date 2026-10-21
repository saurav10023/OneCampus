import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import Subject, { toNameKey, SUBJECT_ORIGIN } from '../models/TimeTable/subject.model.js';
import {
  getSubjectImpact,
  purgeSubjectData,
  recordOfficialOptOut,
  isDuplicateKey,
  isValidId,
} from '../services/subject.service.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertWritable = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};

const duplicateSubjectError = (err) =>
  new ApiError(
    409,
    Object.keys(err.keyPattern || {}).includes('code')
      ? 'Another subject in this setup already uses that code'
      : 'A subject with this name already exists in this setup'
  );

// Scoped to the setup, so another setup's subject id returns 404
const findSubject = async (req) => {
  const { subjectId } = req.params;
  if (!isValidId(subjectId)) throw new ApiError(400, 'Invalid subjectId');
  const subject = await Subject.findOne({ _id: subjectId, setupId: req.setup._id });
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
};

// ---------- Create ----------

const createSubject = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = new Subject({ ...req.body, setupId: req.setup._id }); // origin defaults to manual
  try {
    await subject.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicateSubjectError(err);
    throw err;
  }
  return res.status(201).json(new ApiResponse(201, { subject }, 'Subject created successfully'));
});

// All or nothing: if one save fails, the ones already saved in this request are removed.
const bulkCreateSubjects = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const { subjects: items } = req.body;
  const setupId = req.setup._id;

  // Check against what already exists first, so the usual conflict is reported for every item
  const names = items.map((s) => toNameKey(s.name));
  const codes = items.map((s) => s.code).filter(Boolean);
  const existing = await Subject.find({
    setupId,
    $or: [{ nameKey: { $in: names } }, ...(codes.length ? [{ code: { $in: codes } }] : [])],
  }).select('nameKey code');
  if (existing.length) {
    const takenNames = new Set(existing.map((s) => s.nameKey));
    const takenCodes = new Set(existing.map((s) => s.code).filter(Boolean));
    const errors = [];
    items.forEach((s, i) => {
      if (takenNames.has(toNameKey(s.name))) errors.push(`subjects[${i}]: name already exists in this setup`);
      if (s.code && takenCodes.has(s.code)) errors.push(`subjects[${i}]: code already exists in this setup`);
    });
    throw new ApiError(409, 'Some subjects already exist. Nothing was added.', errors);
  }

  const created = [];
  try {
    for (const item of items) {
      const subject = new Subject({ ...item, setupId });
      await subject.save();
      created.push(subject);
    }
  } catch (err) {
    // Roll back, so a failed request changes nothing and can be retried
    await Subject.deleteMany({ _id: { $in: created.map((s) => s._id) } }).catch(() => {});
    if (isDuplicateKey(err)) throw duplicateSubjectError(err);
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, { subjects: created, count: created.length }, 'Subjects created successfully'));
});

// ---------- Read ----------

// Search matches the start or any part of the name, or the code. Archived are hidden unless
// isActive=false or isActive is not sent and you want all (send nothing to get every subject).
const listSubjects = asyncHandler(async (req, res) => {
  const { page, limit, sort, search, origin, isActive } = req.validatedQuery;

  const filter = { setupId: req.setup._id };
  if (origin) filter.origin = origin;
  if (isActive !== null) filter.isActive = isActive;
  if (search) {
    const pattern = new RegExp(escapeRegex(toNameKey(search)));
    filter.$or = [{ nameKey: pattern }, { code: new RegExp(escapeRegex(search.toUpperCase())) }];
  }

  const sortSpec = sort.startsWith('-')
    ? { [sort.slice(1) === 'name' ? 'nameKey' : sort.slice(1)]: -1 }
    : { [sort === 'name' ? 'nameKey' : sort]: 1 };

  const [subjects, total] = await Promise.all([
    Subject.find(filter).sort(sortSpec).skip((page - 1) * limit).limit(limit),
    Subject.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { subjects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } },
      'Subjects fetched successfully'
    )
  );
});

const getSubject = asyncHandler(async (req, res) => {
  const subject = await findSubject(req);
  return res.status(200).json(new ApiResponse(200, { subject }, 'Subject fetched successfully'));
});

// For forms: is this name or code free? excludeId lets an edit form ignore the subject itself.
const checkSubjectAvailability = asyncHandler(async (req, res) => {
  const { name, code, excludeId } = req.validatedQuery;
  const exclude = excludeId && isValidId(excludeId) ? { _id: { $ne: excludeId } } : {};
  const base = { setupId: req.setup._id, ...exclude };

  const result = {};
  if (name !== undefined) result.nameAvailable = !(await Subject.exists({ ...base, nameKey: toNameKey(name) }));
  if (code !== undefined) result.codeAvailable = !(await Subject.exists({ ...base, code }));

  return res.status(200).json(new ApiResponse(200, result, 'Availability checked'));
});

// ---------- Update ----------

// Uses save(), never findOneAndUpdate, so nameKey is recomputed.
const updateSubject = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);

  // Editing the name or code of an official subject detaches it from official updates
  const touchesIdentity = req.body.name !== undefined || req.body.code !== undefined;
  const warnings = [];
  if (touchesIdentity && subject.origin === SUBJECT_ORIGIN.OFFICIAL && !subject.officialDetached) {
    subject.officialDetached = true;
    warnings.push('This subject came from the official schedule. It will no longer follow official name or code updates.');
  }

  subject.set(req.body); // code: null is turned into "no code" by the model's setter
  try {
    await subject.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicateSubjectError(err);
    throw err;
  }
  return res.status(200).json(new ApiResponse(200, { subject, warnings }, 'Subject updated successfully'));
});

const setSubjectActive = (isActive) =>
  asyncHandler(async (req, res) => {
    assertWritable(req.setup);
    const subject = await findSubject(req);
    if (subject.isActive === isActive) {
      throw new ApiError(409, isActive ? 'Subject is already active' : 'Subject is already archived');
    }
    subject.isActive = isActive;
    await subject.save();
    return res
      .status(200)
      .json(new ApiResponse(200, { subject }, isActive ? 'Subject restored' : 'Subject archived'));
  });

const archiveSubject = setSubjectActive(false);
const restoreSubject = setSubjectActive(true);

// ---------- Delete ----------

const getSubjectDeleteImpact = asyncHandler(async (req, res) => {
  const subject = await findSubject(req);
  const impact = await getSubjectImpact(req.setup._id, subject._id);
  return res.status(200).json(new ApiResponse(200, { impact }, 'Delete impact fetched successfully'));
});

const deleteSubject = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const subject = await findSubject(req);

  // Typed confirmation, because this removes the subject's classes and attendance
  if (req.body?.confirmName !== subject.name) {
    throw new ApiError(400, 'Confirmation failed', ['confirmName must exactly match the subject name']);
  }

  const impact = await getSubjectImpact(req.setup._id, subject._id);
  // Before the purge, so a retry after a crash still hides the subject from sync
  const hiddenFromOfficial = await recordOfficialOptOut(req.setup, subject);
  await purgeSubjectData(req.setup._id, subject._id);

  return res
    .status(200)
    .json(new ApiResponse(200, { deleted: impact, hiddenFromOfficial }, 'Subject and all its data deleted permanently'));
});

export {
  createSubject,
  bulkCreateSubjects,
  listSubjects,
  getSubject,
  checkSubjectAvailability,
  updateSubject,
  archiveSubject,
  restoreSubject,
  getSubjectDeleteImpact,
  deleteSubject,
};