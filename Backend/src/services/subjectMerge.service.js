import ApiError from '../utils/ApiError.js';
import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import ExtraClassAdjustment from '../models/Attendance/extraClassAdjustment.model.js';
import { planRuleMerge, unionRange, pickStatusRow, combineExtras } from '../utils/subjectMergePlan.js';

// Merges `source` into `target`: the source subject disappears and everything it owned moves to
// the target. Duplicate classes (the same weekly class on both sides) are merged into one, and the
// marks are combined. There are no transactions, so every step is repeatable and the plan is
// rebuilt from the database each time: a failed merge is finished by sending it again.

const idOf = (value) => String(value);
const dayKey = (o) => o.date.toISOString().slice(0, 10);
const timeKey = (o) => `${dayKey(o)}|${o.plannedStartTime}`;
const countsOf = (a) => ({
  totalCount: a.totalCount,
  attendedCount: a.attendedCount,
  missedCount: a.missedCount,
});

const loadSubjects = async (setup, sourceId, targetId) => {
  if (idOf(sourceId) === idOf(targetId)) throw new ApiError(400, 'Choose two different subjects');

  const subjects = await Subject.find({ _id: { $in: [sourceId, targetId] }, setupId: setup._id }).lean();
  const source = subjects.find((s) => idOf(s._id) === idOf(sourceId));
  const target = subjects.find((s) => idOf(s._id) === idOf(targetId));
  if (!source) throw new ApiError(404, 'Subject not found');
  if (!target) throw new ApiError(400, 'The subject to merge into was not found in this setup');
  if (target.isActive === false) {
    throw new ApiError(409, 'The subject to merge into is archived. Restore it first.');
  }
  if (source.officialKey && target.officialKey && source.officialKey !== target.officialKey) {
    throw new ApiError(409, 'Two different official subjects cannot be merged');
  }
  return { source, target };
};

const buildPlan = async ({ setup, userId, source, target, prefer }) => {
  const setupId = setup._id;

  const [sourceRules, targetRules] = await Promise.all([
    RecurringRule.find({ setupId, subjectId: source._id }).lean(),
    RecurringRule.find({ setupId, subjectId: target._id }).lean(),
  ]);
  const { pairs: rulePairs, moves } = planRuleMerge(targetRules, sourceRules);

  // Classes of rules that are the same class on both sides: same date means the same class
  const pairRuleIds = rulePairs.flatMap((p) => [p.keep._id, p.drop._id]);
  const pairOccurrences = pairRuleIds.length
    ? await Occurrence.find({ setupId, recurringRuleId: { $in: pairRuleIds } }).lean()
    : [];
  const byRule = new Map();
  for (const occ of pairOccurrences) {
    const key = idOf(occ.recurringRuleId);
    if (!byRule.has(key)) byRule.set(key, new Map());
    byRule.get(key).set(dayKey(occ), occ);
  }

  const occurrencePairs = []; // { keepOcc, dropOcc, keepSide }
  const reparent = []; // classes with no twin that follow the surviving rule
  for (const p of rulePairs) {
    const keepMap = byRule.get(idOf(p.keep._id)) ?? new Map();
    const dropMap = byRule.get(idOf(p.drop._id)) ?? new Map();
    for (const occ of dropMap.values()) {
      const twin = keepMap.get(dayKey(occ));
      if (twin) occurrencePairs.push({ keepOcc: twin, dropOcc: occ, keepSide: p.keepSide });
      else reparent.push({ occ, keepRuleId: p.keep._id });
    }
  }

  // One-off classes: the same date and start time on both sides is the same class
  const oneOffs = await Occurrence.find({
    setupId,
    subjectId: { $in: [source._id, target._id] },
    sourceType: 'manual_import',
  }).lean();
  const targetOneOffs = new Map(
    oneOffs.filter((o) => idOf(o.subjectId) === idOf(target._id)).map((o) => [timeKey(o), o])
  );
  for (const o of oneOffs.filter((x) => idOf(x.subjectId) === idOf(source._id))) {
    const twin = targetOneOffs.get(timeKey(o));
    if (twin) occurrencePairs.push({ keepOcc: twin, dropOcc: o, keepSide: 'target' });
  }

  // Decide, for every duplicate class, which status row survives
  const involved = occurrencePairs.flatMap((p) => [p.keepOcc._id, p.dropOcc._id]);
  const rows = involved.length
    ? await OccurrenceStatus.find({ userId, occurrenceId: { $in: involved } }).lean()
    : [];
  const rowByOccurrence = new Map(rows.map((r) => [idOf(r.occurrenceId), r]));

  const decisions = occurrencePairs.map((p) => {
    const keepRow = rowByOccurrence.get(idOf(p.keepOcc._id)) ?? null;
    const dropRow = rowByOccurrence.get(idOf(p.dropOcc._id)) ?? null;
    const targetRow = p.keepSide === 'target' ? keepRow : dropRow;
    const sourceRow = p.keepSide === 'target' ? dropRow : keepRow;
    const { use, conflict } = pickStatusRow(targetRow, sourceRow, prefer);
    return {
      ...p,
      keepRow,
      dropRow,
      targetRow,
      sourceRow,
      used: use,
      conflict,
      chosen: use === 'none' ? null : use === 'target' ? targetRow : sourceRow,
    };
  });

  // Extra-class counters
  const [sourceExtra, targetExtra] = await Promise.all([
    ExtraClassAdjustment.findOne({ setupId, subjectId: source._id }).lean(),
    ExtraClassAdjustment.findOne({ setupId, subjectId: target._id }).select('+mergedSources').lean(),
  ]);
  let extras = { action: 'none' };
  if (sourceExtra && !targetExtra) {
    extras = { action: 'move' };
  } else if (sourceExtra && targetExtra) {
    if ((targetExtra.mergedSources ?? []).some((id) => idOf(id) === idOf(source._id))) {
      extras = { action: 'already' }; // added by an earlier try that stopped before the delete
    } else {
      const { next, errors } = combineExtras(countsOf(targetExtra), countsOf(sourceExtra));
      if (errors.length) {
        throw new ApiError(409, 'The extra classes of the two subjects add up to more than the limit', errors);
      }
      extras = { action: 'add', next, from: countsOf(targetExtra) };
    }
  }

  return { rulePairs, moves, reparent, decisions, extras };
};

const describe = (plan, source, target) => ({
  from: { id: source._id, name: source.name },
  into: { id: target._id, name: target.name },
  rules: { merged: plan.rulePairs.length, moved: plan.moves.length },
  duplicateClassesMerged: plan.decisions.length,
  conflicts: plan.decisions
    .filter((d) => d.conflict)
    .map((d) => ({
      date: dayKey(d.keepOcc),
      target: d.targetRow?.status ?? 'pending',
      source: d.sourceRow?.status ?? 'pending',
      kept: d.used,
    })),
  extraClasses: plan.extras.action,
  officialLinkTransferred: Boolean(source.officialKey && !target.officialKey),
});

const executePlan = async ({ setup, source, target, plan }) => {
  const setupId = setup._id;

  // 1. Duplicate classes become one. The surviving class keeps the chosen status row.
  for (const d of plan.decisions) {
    const losers = [d.keepRow, d.dropRow].filter((r) => r && (!d.chosen || idOf(r._id) !== idOf(d.chosen._id)));
    if (losers.length) await OccurrenceStatus.deleteMany({ _id: { $in: losers.map((r) => r._id) } });
    if (d.chosen && idOf(d.chosen.occurrenceId) !== idOf(d.keepOcc._id)) {
      await OccurrenceStatus.updateOne({ _id: d.chosen._id }, { $set: { occurrenceId: d.keepOcc._id } });
    }
    await Occurrence.deleteOne({ _id: d.dropOcc._id });
  }

  // 2. Classes with no twin follow the surviving rule
  if (plan.reparent.length) {
    await Occurrence.bulkWrite(
      plan.reparent.map(({ occ, keepRuleId }) => ({
        updateOne: {
          filter: { _id: occ._id },
          update: { $set: { recurringRuleId: keepRuleId, subjectId: target._id } },
        },
      })),
      { ordered: false }
    );
  }

  // 3. Rules: the survivor covers both date ranges, the duplicate goes, the rest move
  for (const p of plan.rulePairs) {
    const range = unionRange(p.keep, p.drop);
    await RecurringRule.updateOne(
      { _id: p.keep._id },
      { $set: { subjectId: target._id, effectiveStartDate: range.start, effectiveEndDate: range.end } }
    );
    await RecurringRule.deleteOne({ _id: p.drop._id });
  }
  if (plan.moves.length) {
    await RecurringRule.updateMany(
      { _id: { $in: plan.moves.map((r) => r._id) } },
      { $set: { subjectId: target._id } }
    );
  }

  // 4. Every class still on the source subject now belongs to the target
  await Occurrence.updateMany({ setupId, subjectId: source._id }, { $set: { subjectId: target._id } });

  // 5. Extra classes
  if (plan.extras.action === 'move') {
    await ExtraClassAdjustment.updateOne({ setupId, subjectId: source._id }, { $set: { subjectId: target._id } });
  } else if (plan.extras.action === 'add') {
    // One write that adds the counters and records the source, only if the counters are unchanged
    // and the source has not been added yet. A retry can therefore never add them twice.
    const result = await ExtraClassAdjustment.updateOne(
      { setupId, subjectId: target._id, mergedSources: { $ne: source._id }, ...plan.extras.from },
      { $set: plan.extras.next, $addToSet: { mergedSources: source._id } }
    );
    if (!result.modifiedCount) {
      throw new ApiError(409, 'Extra classes changed while merging. Send the merge again.');
    }
    await ExtraClassAdjustment.deleteOne({ setupId, subjectId: source._id });
  } else if (plan.extras.action === 'already') {
    await ExtraClassAdjustment.deleteOne({ setupId, subjectId: source._id });
  }

  // 6. A subject linked to the official schedule keeps its link. The unique index on officialKey
  // means it must leave the source first.
  if (source.officialKey && !target.officialKey) {
    await Subject.updateOne({ _id: source._id }, { $unset: { officialKey: 1 } });
    await Subject.updateOne(
      { _id: target._id },
      {
        $set: {
          officialKey: source.officialKey,
          origin: source.origin,
          officialRevisionSeen: source.officialRevisionSeen ?? 0,
          officialDetached: false,
        },
      }
    );
  }

  // 7. Last, so a failure above leaves the source in place and the merge can be sent again
  await Subject.deleteOne({ _id: source._id, setupId });
};

const previewSubjectMerge = async ({ setup, userId, sourceId, targetId, prefer = 'target' }) => {
  const { source, target } = await loadSubjects(setup, sourceId, targetId);
  const plan = await buildPlan({ setup, userId, source, target, prefer });
  return describe(plan, source, target);
};

const mergeSubjects = async ({ setup, userId, sourceId, targetId, prefer = 'target' }) => {
  const { source, target } = await loadSubjects(setup, sourceId, targetId);
  const plan = await buildPlan({ setup, userId, source, target, prefer });
  const summary = describe(plan, source, target);
  await executePlan({ setup, source, target, plan });
  return { ...summary, merged: true };
};

export { previewSubjectMerge, mergeSubjects };