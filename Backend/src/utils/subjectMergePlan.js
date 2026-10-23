import { ORIGIN } from './constants.js';
import { checkCounts } from './extraClassMath.js';

// Pure planning for "merge subject A into subject B". No database.
// source = the subject that disappears. target = the subject that stays.

// Two weekly rules are the same class when these agree
const ruleKey = (r) => [r.weekday, r.startTime, r.endTime, r.group ?? '', r.classType ?? 'lecture'].join('|');

// Finds rules that are the same class on both sides, and the rules that simply move.
// pairs: { keep, drop, keepSide }. The official rule survives (its link to the schedule must not
// be lost), otherwise the target's. Two official rules are never merged.
const planRuleMerge = (targetRules, sourceRules) => {
  const byKey = new Map();
  for (const t of targetRules) if (!byKey.has(ruleKey(t))) byKey.set(ruleKey(t), t);

  const used = new Set();
  const pairs = [];
  const moves = [];
  for (const s of sourceRules) {
    const t = byKey.get(ruleKey(s));
    if (!t || used.has(String(t._id))) { moves.push(s); continue; }
    const sOfficial = s.origin === ORIGIN.OFFICIAL;
    const tOfficial = t.origin === ORIGIN.OFFICIAL;
    if (sOfficial && tOfficial) { moves.push(s); continue; }
    used.add(String(t._id));
    pairs.push(sOfficial ? { keep: s, drop: t, keepSide: 'source' } : { keep: t, drop: s, keepSide: 'target' });
  }
  return { pairs, moves };
};

const unionRange = (a, b) => ({
  start: a.effectiveStartDate <= b.effectiveStartDate ? a.effectiveStartDate : b.effectiveStartDate,
  end: a.effectiveEndDate >= b.effectiveEndDate ? a.effectiveEndDate : b.effectiveEndDate,
});

// When both subjects have a status row for the same class date, which one survives?
// A class held by the system (not counted, or cancelled by a cause) outranks a mark the student
// made, which outranks "nothing". Equal rank and different marks is a conflict: `prefer` decides.
const rank = (row) => {
  if (!row || row.status === 'pending') return 0;
  if (row.status === 'not_counted' || row.causeType) return 3;
  return 2;
};
const sameRow = (a, b) =>
  a.status === b.status && String(a.causeType ?? '') === String(b.causeType ?? '') && String(a.causeId ?? '') === String(b.causeId ?? '');

const pickStatusRow = (targetRow, sourceRow, prefer = 'target') => {
  const t = rank(targetRow);
  const s = rank(sourceRow);
  if (t === 0 && s === 0) return { use: 'none', conflict: false };
  if (t > s) return { use: 'target', conflict: false };
  if (s > t) return { use: 'source', conflict: false };
  if (sameRow(targetRow, sourceRow)) return { use: 'target', conflict: false };
  return { use: prefer === 'source' ? 'source' : 'target', conflict: true };
};

// Extra-class counters of the two subjects, added together
const combineExtras = (targetCounts, sourceCounts) => {
  const next = {
    totalCount: targetCounts.totalCount + sourceCounts.totalCount,
    attendedCount: targetCounts.attendedCount + sourceCounts.attendedCount,
    missedCount: targetCounts.missedCount + sourceCounts.missedCount,
  };
  return { next, errors: checkCounts(next) };
};

export { ruleKey, planRuleMerge, unionRange, pickStatusRow, combineExtras };