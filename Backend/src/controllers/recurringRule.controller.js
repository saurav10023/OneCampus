import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import { formatDateOnly } from '../utils/date.util.js';
import { ORIGIN } from '../utils/constants.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import {
  findOverlaps,
  generateForRule,
  syncRuleOccurrences,
  getRuleDeleteImpact,
  deleteRuleWithChildren,
} from '../services/recurringRule.service.js';
import { hideOfficialRule } from '../services/officialOverride.service.js';
import { nowInZone, fromDateText } from '../utils/dateWindow.js';

const todayInSetup = (setup) => fromDateText(nowInZone(setup.timezone).date);

// Only these fields can come from the client. setupId comes from the route (req.setup);
// ruleVersion, origin, detachedFromOfficial and the official link fields are set by the server
// or the sync service.
const CREATE_FIELDS = [
  'subjectId',
  'weekday',
  'startTime',
  'endTime',
  'effectiveStartDate',
  'effectiveEndDate',
  'professor',
  'room',
  'classType',
  'group',
  'attendanceUnits',
];
const EDIT_FIELDS = [...CREATE_FIELDS, 'isActive'];

// Fields the model uses to bump ruleVersion (isActive is not one of them)
const VERSION_FIELDS = [
  'subjectId',
  'weekday',
  'startTime',
  'endTime',
  'attendanceUnits',
  'effectiveStartDate',
  'effectiveEndDate',
  'classType',
  'group',
];
// Changing one of these changes which classes exist or what they snapshot
// (classType and group are copied onto every class, and mass bunk matches on them)
const SCHEDULE_FIELDS = [...VERSION_FIELDS, 'isActive'];
// Changing one of these can create or remove a clash with another class
const OVERLAP_FIELDS = [
  'subjectId',
  'weekday',
  'startTime',
  'endTime',
  'effectiveStartDate',
  'effectiveEndDate',
  'group',
  'isActive',
];
// A student's edit to these detaches an official class from later official changes.
// professor and room are not here: they are the student's own notes.
const DETACH_FIELDS = VERSION_FIELDS;

const MAX_RULES_PER_SETUP = 150;

// --- pure helpers start
const pick = (source, keys) =>
  Object.fromEntries(
    keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]])
  );

// "2026-10-22" or a Date becomes a Date at UTC midnight. Anything else, including a date that
// does not exist (2026-02-31), becomes null.
const toDateOnly = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    const text = value.trim().slice(0, 10);
    const date = new Date(`${text}T00:00:00.000Z`);
    // Node rolls 2026-02-31 over to 3 March, so the text must survive a round trip
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : null;
  }
  return null;
};

// Accepts a 24-hex-character id as text (or an ObjectId, which prints as that text).
// Objects such as {"$ne": null} print as "[object Object]" and are refused.
const idText = (value) => {
  const text = typeof value === 'string' ? value : value?.toString?.();
  return typeof text === 'string' && /^[0-9a-fA-F]{24}$/.test(text) ? text : null;
};

const NUMBER_FIELDS = ['weekday', 'attendanceUnits'];
const TEXT_FIELDS = ['startTime', 'endTime', 'professor', 'room', 'classType'];
const DATE_FIELDS = ['effectiveStartDate', 'effectiveEndDate'];

// Cleans client input so only plain values of the right kind reach the model
const normalizeRuleInput = (input) => {
  const out = { ...input };
  const errors = [];

  if (out.subjectId !== undefined) {
    const id = idText(out.subjectId);
    if (id) out.subjectId = id;
    else errors.push('subjectId is not valid');
  }

  for (const field of NUMBER_FIELDS) {
    if (out[field] === undefined) continue;
    const value =
      typeof out[field] === 'string' && out[field].trim() !== '' ? Number(out[field]) : out[field];
    if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${field} must be a number`);
    else out[field] = value;
  }

  for (const field of TEXT_FIELDS) {
    if (out[field] !== undefined && typeof out[field] !== 'string') {
      errors.push(`${field} must be text`);
    }
  }
  if (out.group !== undefined && out.group !== null && typeof out.group !== 'string') {
    errors.push('group must be text or null');
  }

  for (const field of DATE_FIELDS) {
    if (out[field] === undefined) continue;
    const date = toDateOnly(out[field]);
    if (date) out[field] = date;
    else errors.push(`${field} must be a date like 2026-10-22`);
  }

  if (out.isActive !== undefined && typeof out.isActive !== 'boolean') {
    errors.push('isActive must be true or false');
  }

  if (errors.length) throw new ApiError(400, 'Invalid input', errors);
  return out;
};
// --- pure helpers end

// const todayUtc = () => {
//   const now = new Date();
//   return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
// };

const assertWritable = (setup) => {
  if (setup.status === 'archived') throw new ApiError(409, 'Archived setups are read-only');
};

const assertBoolean = (name, value) => {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new ApiError(400, `${name} must be true or false`);
  }
};

// Turns a model ValidationError into a clear 400 before anything is written
const validateOrThrow = async (doc) => {
  try {
    await doc.validate();
  } catch (err) {
    if (err?.name === 'ValidationError') {
      throw new ApiError(
        400,
        'Validation failed',
        Object.values(err.errors).map((error) => error.message)
      );
    }
    throw err;
  }
};

const assertWithinSetup = (setup, values) => {
  if (values.effectiveStartDate < setup.startDate || values.effectiveEndDate > setup.endDate) {
    throw new ApiError(
      400,
      `Class dates must fall inside your setup (${formatDateOnly(setup.startDate)} to ` +
        `${formatDateOnly(setup.endDate)})`
    );
  }
};

const loadRule = async (req) => {
  const { ruleId } = req.params;
  if (!idText(ruleId)) throw new ApiError(404, 'Class rule not found');

  const rule = await RecurringRule.findOne({ _id: ruleId, setupId: req.setup._id });
  if (!rule) throw new ApiError(404, 'Class rule not found');
  return rule;
};

// requireActive: new classes cannot be put on an archived subject. Switching off or editing a
// rule that already belongs to one is still allowed, so it is only set on create and subject change.
const loadSubject = async (setup, subjectId, { requireActive = false } = {}) => {
  const subject = await Subject.findOne({ _id: subjectId, setupId: setup._id }).select(
    'name isActive'
  );
  if (!subject) throw new ApiError(400, 'Subject not found in this setup');
  if (requireActive && subject.isActive === false) {
    throw new ApiError(409, 'This subject is archived. Restore it before adding classes to it.');
  }
  return subject;
};

const createRule = asyncHandler(async (req, res) => {
  const setup = req.setup;
  assertWritable(setup);

  const body = req.body ?? {};
  assertBoolean('confirmOverlap', body.confirmOverlap);

  const data = normalizeRuleInput(pick(body, CREATE_FIELDS));
  if (!data.subjectId) throw new ApiError(400, 'subjectId is required');
  // Default to the whole setup
  if (!data.effectiveStartDate) data.effectiveStartDate = setup.startDate;
  if (!data.effectiveEndDate) data.effectiveEndDate = setup.endDate;
  assertWithinSetup(setup, data);

  const subject = await loadSubject(setup, data.subjectId, { requireActive: true });

  const count = await RecurringRule.countDocuments({ setupId: setup._id });
  if (count >= MAX_RULES_PER_SETUP) {
    throw new ApiError(409, `A setup can have at most ${MAX_RULES_PER_SETUP} weekly classes`);
  }

  const rule = new RecurringRule({ ...data, setupId: setup._id });
  await validateOrThrow(rule);

  const warnings = await findOverlaps({
    setupId: setup._id,
    candidate: rule,
    subjectName: subject.name,
  });
  if (warnings.length && body.confirmOverlap !== true) {
    throw new ApiError(409, 'This class overlaps with another one', [
      ...warnings,
      'Send confirmOverlap: true to add it anyway.',
    ]);
  }

  await rule.save();

  // If this fails the rule exists without its classes. POST /:ruleId/regenerate fixes that.
  const { generated, cancelledByEvents } = await generateForRule({
    setupId: setup._id,
    userId: req.user._id,
    rule,
  });

  if (cancelledByEvents) {
    warnings.push(
      `${cancelledByEvents} class(es) fall on a holiday, break or exam in your calendar and were ` +
        'marked "Cancelled" (not counted).'
    );
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { rule, generated, cancelledByEvents, warnings },
        'Weekly class added successfully'
      )
    );
});

const listRules = asyncHandler(async (req, res) => {
  const filter = { setupId: req.setup._id };

  if (req.query.isActive === 'true') filter.isActive = true;
  if (req.query.isActive === 'false') filter.isActive = false;
  if (req.query.subjectId !== undefined) {
    const id = idText(req.query.subjectId);
    if (!id) throw new ApiError(400, 'subjectId is not valid');
    filter.subjectId = id;
  }
  if (req.query.weekday !== undefined) {
    const weekday = Number(req.query.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new ApiError(400, 'weekday must be a whole number from 0 to 6');
    }
    filter.weekday = weekday;
  }

  const rules = await RecurringRule.find(filter)
    .populate('subjectId', 'name code')
    .sort({ weekday: 1, startTime: 1 });

  return res
    .status(200)
    .json(new ApiResponse(200, { rules }, 'Weekly classes fetched successfully'));
});

const getRule = asyncHandler(async (req, res) => {
  const rule = await loadRule(req);
  await rule.populate('subjectId', 'name code');

  return res.status(200).json(new ApiResponse(200, { rule }, 'Weekly class fetched successfully'));
});

// Edits a rule from `effectiveFrom` onward (default today). Classes before that date are never
// changed. Changing or cancelling a single class on one date is not handled here: today that
// means marking it cancelled through the occurrence endpoints.
const updateRule = asyncHandler(async (req, res) => {
  const setup = req.setup;
  assertWritable(setup);

  const rule = await loadRule(req);
  const body = req.body ?? {};
  assertBoolean('confirmOverlap', body.confirmOverlap);

  // const effectiveFrom =
  //   body.effectiveFrom === undefined ? todayUtc() : toDateOnly(body.effectiveFrom);
  const effectiveFrom =
  body.effectiveFrom === undefined ? todayInSetup(setup) : toDateOnly(body.effectiveFrom);
  if (!effectiveFrom) throw new ApiError(400, 'effectiveFrom must be a date like 2026-10-22');

  const changes = normalizeRuleInput(pick(body, EDIT_FIELDS));
  if (!Object.keys(changes).length) throw new ApiError(400, 'Nothing to update');

  const previous = rule.toObject();
  rule.set(changes);

  assertWithinSetup(setup, rule);
  const subject = await loadSubject(setup, rule.subjectId, {
    requireActive: rule.isModified('subjectId'),
  });
  await validateOrThrow(rule);

  const warnings = [];
  const scheduleChanged = SCHEDULE_FIELDS.some((field) => rule.isModified(field));

  // Overlaps matter only when something that affects a clash changed, or the rule was switched on
  if (rule.isActive && OVERLAP_FIELDS.some((field) => rule.isModified(field))) {
    const overlaps = await findOverlaps({
      setupId: setup._id,
      candidate: rule,
      subjectName: subject.name,
      excludeRuleId: rule._id,
    });
    if (overlaps.length && body.confirmOverlap !== true) {
      throw new ApiError(409, 'This change makes the class overlap with another one', [
        ...overlaps,
        'Send confirmOverlap: true to save it anyway.',
      ]);
    }
    warnings.push(...overlaps);
  }

  // The student's own change means official updates no longer overwrite this class
  if (
    rule.origin === ORIGIN.OFFICIAL &&
    !rule.detachedFromOfficial &&
    DETACH_FIELDS.some((field) => rule.isModified(field))
  ) {
    rule.detachedFromOfficial = true;
    warnings.push(
      'This class came from the official schedule. It will no longer receive official changes.'
    );
  }

  // Decided here, so the model's save hook leaves ruleVersion alone and the new version is
  // already known when the classes are updated
  if (VERSION_FIELDS.some((field) => rule.isModified(field))) {
    rule.ruleVersion = previous.ruleVersion + 1;
  }

  let sync = null;
  if (scheduleChanged) {
    // Classes before the rule's own start date are not "from" anything, so start there at the earliest
    const boundary =
      effectiveFrom > previous.effectiveStartDate ? effectiveFrom : previous.effectiveStartDate;

    sync = await syncRuleOccurrences({
      setupId: setup._id,
      userId: req.user._id,
      desired: rule.toObject(),
      previous,
      boundary,
    });

    if (boundary > previous.effectiveStartDate) {
      warnings.push(`Classes before ${formatDateOnly(boundary)} were not changed.`);
    }
    if (sync.removed) {
      warnings.push(`${sync.removed} class(es) that no longer match were removed.`);
    }
    if (sync.keptWithData) {
      warnings.push(
        `${sync.keptWithData} class(es) that no longer match already have attendance recorded ` +
          'and were kept. Review them.'
      );
    }
    if (sync.generated) {
      warnings.push(`${sync.generated} new class(es) were added.`);
    }
    if (sync.cancelledByEvents) {
      warnings.push(
        `${sync.cancelledByEvents} new class(es) fall on a holiday, break or exam in your ` +
          'calendar and were marked "Cancelled" (not counted).'
      );
    }
  }

  // The rule is saved last: if anything above failed, nothing about the rule has changed yet,
  // so sending the same edit again finishes the job
  await rule.save();
  await rule.populate('subjectId', 'name code');

  return res
    .status(200)
    .json(new ApiResponse(200, { rule, sync, warnings }, 'Weekly class updated successfully'));
});

// Repairs a rule whose classes were not generated, for example if the server stopped right after
// the rule was created. Adds only what is missing. Safe to run any number of times.
const regenerateRule = asyncHandler(async (req, res) => {
  assertWritable(req.setup);
  const rule = await loadRule(req);

  if (!rule.isActive) {
    throw new ApiError(409, 'This weekly class is switched off. Switch it on before regenerating.');
  }

  // After an edit, the weekday or time differs from older classes, and regenerating the whole
  // range would add classes in the past that never existed. An edit that stopped halfway is
  // repaired by sending the same edit again: the rule is saved last, so it is still unchanged.
  if (rule.ruleVersion > 1) {
    throw new ApiError(
      409,
      'This weekly class was edited. To repair it, send the same edit again.'
    );
  }

  const { generated, cancelledByEvents } = await generateForRule({
    setupId: req.setup._id,
    userId: req.user._id,
    rule,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, { generated, cancelledByEvents }, 'Classes checked and regenerated')
    );
});

// Read-only preview of what a delete would destroy
const getRuleDeleteImpactHandler = asyncHandler(async (req, res) => {
  const rule = await loadRule(req);
  const impact = await getRuleDeleteImpact(rule, req.user._id);

  return res
    .status(200)
    .json(new ApiResponse(200, { impact }, 'Delete impact fetched successfully'));
});

const deleteRule = asyncHandler(async (req, res) => {
  const setup = req.setup;
  assertWritable(setup);

  const rule = await loadRule(req);
  const confirm = req.body?.confirm;
  assertBoolean('confirm', confirm);

  const impact = await getRuleDeleteImpact(rule, req.user._id);

  // Recorded attendance is permanent once deleted, so it needs an explicit yes
  if (impact.recordedClasses > 0 && confirm !== true) {
    throw new ApiError(409, 'Deleting this weekly class also deletes recorded attendance', [
      `${impact.classes} class(es) will be deleted, ${impact.recordedClasses} with attendance or marks.`,
      'Send confirm: true to delete it. To keep the history, set isActive to false instead.',
    ]);
  }

  // Before the delete, so a retry after a crash still hides it. The hide record is what stops
  // sync from adding an official class back: the unique index on officialRuleId goes with the rule.
  const hidden = await hideOfficialRule(setup, rule);

  const summary = await deleteRuleWithChildren({ setup, rule, userId: req.user._id });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { summary, hiddenFromOfficial: hidden > 0 },
        'Weekly class and its classes deleted'
      )
    );
});

export {
  createRule,
  listRules,
  getRule,
  updateRule,
  regenerateRule,
  getRuleDeleteImpactHandler,
  deleteRule,
};