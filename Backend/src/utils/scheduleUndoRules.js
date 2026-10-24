// Pure rules for undo, redo and admin revert. No database and no imports, so they can be tested alone.
// The snapshot helpers (canonicalSnapshot, snapshotMatches, statePatch) live in scheduleActions.js;
// this file holds what sits around them: which actions may be reversed at all, what to check before a
// record becomes active again, and the wording for the log.
//
// Words used here:
//   undo   = reverse an ordinary action (put the record back to the action's "before")
//   redo   = undo an undo (the same move, aimed at an action whose op is "undo")
//   revert = an admin's undo that ignores later changes to the record

const MODES = Object.freeze(['undo', 'redo', 'revert']);

// Checks only the action itself. Returns the reason it cannot be reversed, or null.
const undoability = (action, mode) => {
  const isUndoAction = action.op === 'undo';
  if (mode === 'undo' && isUndoAction) {
    return 'This action is itself an undo. Use redo to apply the original change again.';
  }
  if (mode === 'redo' && !isUndoAction) {
    return 'Only an undo can be redone. Use undo on this action instead.';
  }
  if (action.undoneBy) {
    return isUndoAction ? 'This undo has already been redone.' : 'This action has already been undone.';
  }
  // The schedule record itself is never withdrawn, so its creation has nothing to go back to
  if (action.target?.kind === 'schedule' && action.before === null) {
    return 'Creating a schedule cannot be undone. Archive the schedule instead.';
  }
  return null;
};

// Reversing puts the record back to what the action started from
const targetState = (action) => action.before;

// Does the target state make a subject, rule or item active (so its references need checking)?
const makesActive = (kind, to) => kind !== 'schedule' && to !== null && to !== undefined && to.status === 'active';
// Does it take an active subject, rule or item out of use?
const makesInactive = (kind, to) => kind !== 'schedule' && (to === null || to === undefined || to.status === 'withdrawn');

const groupKeys = (groups) => (groups ?? []).map((g) => g.key);
// Group keys the schedule has now that the target state does not have
const removedGroupKeys = (currentGroups, targetGroups) => {
  const keep = new Set(groupKeys(targetGroups));
  return groupKeys(currentGroups).filter((key) => !keep.has(key));
};

// ---- Class overlap (checked before a weekly or makeup class comes back) ----
// Same weekday, overlapping times, overlapping dates and overlapping groups. A class with no group
// is for the whole section, so it overlaps every group. A date range of null is open-ended.
// ASSUMPTION: this mirrors what a student cannot attend twice. If your own rule-clash helper is
// stricter or looser, call that instead.
const timesOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
const groupsOverlap = (a, b) => !a || !b || a === b;
const datesOverlap = (a, b) => {
  const aStart = a.effectiveStartDate ?? '0000-01-01';
  const aEnd = a.effectiveEndDate ?? '9999-12-31';
  const bStart = b.effectiveStartDate ?? '0000-01-01';
  const bEnd = b.effectiveEndDate ?? '9999-12-31';
  return aStart <= bEnd && bStart <= aEnd;
};
// a and b: canonical rule snapshots (dates as YYYY-MM-DD)
const rulesOverlap = (a, b) =>
  a.weekday === b.weekday &&
  timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime) &&
  groupsOverlap(a.group ?? null, b.group ?? null) &&
  datesOverlap(a, b);

// ---- Log wording ----
const MAX_SUMMARY = 200;
const PREFIX = /^(Undid|Redid|Reverted): /;
const stripPrefix = (text) => (text ?? '').replace(PREFIX, '');
const clip = (text) => (text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY - 1)}…` : text);

// "Undid: Added exam "Mid-sem" on 2026-10-12". A redo drops the "Undid:" so it reads "Redid: Added exam…".
const describeReversal = (action, mode) => {
  if (mode === 'undo') return clip(`Undid: ${action.summary || 'a change'}`);
  if (mode === 'redo') return clip(`Redid: ${stripPrefix(action.summary) || 'a change'}`);
  return clip(`Reverted: ${stripPrefix(action.summary) || 'a change'}`);
};

export {
  MODES,
  undoability,
  targetState,
  makesActive,
  makesInactive,
  removedGroupKeys,
  rulesOverlap,
  describeReversal,
};