import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import ExtraClassAdjustment from '../models/Attendance/extraClassAdjustment.model.js';

// ASSUMPTION: Occurrence has setupId and subjectId, and ExtraClassAdjustment has setupId and
// subjectId. If Occurrence only links to its rule, the ruleId branch below still finds them.
const occurrenceFilter = (setupId, subjectId, ruleIds) => ({
  setupId,
  $or: [{ subjectId }, ...(ruleIds.length ? [{ ruleId: { $in: ruleIds } }] : [])],
});

// What deleting the subject would destroy, so the app can show a real confirmation
const getSubjectImpact = async (setupId, subjectId) => {
  const ruleIds = await RecurringRule.distinct('_id', { setupId, subjectId });
  const occurrenceIds = await Occurrence.distinct('_id', occurrenceFilter(setupId, subjectId, ruleIds));

  const [attendanceRecords, extraClassAdjustments] = await Promise.all([
    OccurrenceStatus.countDocuments({ occurrenceId: { $in: occurrenceIds } }),
    ExtraClassAdjustment.countDocuments({ setupId, subjectId }),
  ]);

  return {
    recurringRules: ruleIds.length,
    occurrences: occurrenceIds.length,
    attendanceRecords,
    extraClassAdjustments,
  };
};

// Every step is idempotent and the subject goes last, so a failed delete can simply be retried.
const purgeSubjectData = async (setupId, subjectId) => {
  const ruleIds = await RecurringRule.distinct('_id', { setupId, subjectId });
  const occurrenceIds = await Occurrence.distinct('_id', occurrenceFilter(setupId, subjectId, ruleIds));

  await OccurrenceStatus.deleteMany({ occurrenceId: { $in: occurrenceIds } });
  await Occurrence.deleteMany({ _id: { $in: occurrenceIds } });
  await Promise.all([
    RecurringRule.deleteMany({ setupId, subjectId }),
    ExtraClassAdjustment.deleteMany({ setupId, subjectId }),
  ]);
  await Subject.deleteOne({ _id: subjectId, setupId });
};

// Deleting a synced subject hides it from future syncs (v2 §4.5). This only does something once
// Setup has an `officialOptOuts` field; until then it is skipped, so nothing breaks.
// DECIDE when adding the field whether `id` holds the officialKey (string) or an ObjectId.
const recordOfficialOptOut = async (setup, subject) => {
  if (!setup.officialScheduleId || !subject.officialKey) return false;
  if (!Setup.schema.path('officialOptOuts')) return false;
  await Setup.updateOne(
    { _id: setup._id },
    { $addToSet: { officialOptOuts: { kind: 'subject', id: subject.officialKey } } }
  );
  return true;
};

const isDuplicateKey = (err) => err?.code === 11000;
const isValidId = (id) => mongoose.isValidObjectId(id);

export { getSubjectImpact, purgeSubjectData, recordOfficialOptOut, isDuplicateKey, isValidId };