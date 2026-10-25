// Pure rules for the student's actions on the "Official updates" list. No database and no imports,
// so they can be tested alone.
//
// An update line is { targetKind, targetId, change, status, revision, proposed, data }.
// Only a PENDING line waits for the student. What each pending line allows:
//   rule + updated   accept = take the CR's new times/room/group; dismiss = keep mine (detaches the class)
//   rule + withdrawn accept = remove the class from my timetable; dismiss = keep it (detaches the class)
//   subject + conflict   cannot be accepted (rename or merge one of the two subjects); dismiss only
// A line that was applied, dismissed or superseded is history: only "mark read" works on it.

const ACCEPT_RULE_CHANGE = 'rule_change';
const ACCEPT_RULE_REMOVAL = 'rule_removal';

// 'rule_change', 'rule_removal', or null when the line cannot be accepted
const acceptKind = (update) => {
  if (update.status !== 'pending' || update.targetKind !== 'rule') return null;
  if (update.change === 'updated') return ACCEPT_RULE_CHANGE;
  if (update.change === 'withdrawn') return ACCEPT_RULE_REMOVAL;
  return null;
};

// Why accept is refused for this line, or null
const acceptBlockedReason = (update) => {
  if (update.status !== 'pending') return `This update is already ${update.status}`;
  if (update.targetKind === 'subject') {
    return 'A subject clash cannot be accepted. Rename or merge one of the two subjects, then dismiss this.';
  }
  return acceptKind(update) ? null : 'This update has nothing to accept';
};

const dismissBlockedReason = (update) =>
  update.status === 'pending' ? null : `This update is already ${update.status}`;

// Dismissing a pending change to a weekly class means "keep mine": the class stops receiving official
// changes. A subject clash has no class to detach.
const dismissDetachesRule = (update) => update.targetKind === 'rule' && update.status === 'pending';

// The student's rule fields after accepting the CR's CURRENT version of the class.
// range: { start, end } from clampRuleRange (the official dates fitted into the student's setup).
const patchFromOfficial = (official, range) => ({
  weekday: official.weekday,
  startTime: official.startTime,
  endTime: official.endTime,
  classType: official.classType,
  group: official.group ?? null,
  attendanceUnits: official.attendanceUnits,
  room: official.room ?? null,
  professor: official.professor ?? null,
  effectiveStartDate: range.start,
  effectiveEndDate: range.end,
});

// Sync re-reads everything with a revision above `lastSyncedContentRevision - overlap`. To make it
// read one record again (after restoring an opt-out or re-attaching), the mark is lowered to just
// before that record's revision. Never raised: $min is used in the query.
const markBefore = (revision) => Math.max(0, (revision ?? 0) - 1);

const OPT_OUT_KINDS = Object.freeze(['subject', 'rule', 'item']);

// "rule:6650..." style key, the same one the sync uses for its opt-out set
const optOutKey = (entry) => `${entry.kind}:${entry.id}`;

const hasOptOut = (optOuts, kind, id) => (optOuts ?? []).some((o) => optOutKey(o) === `${kind}:${id}`);

export {
  ACCEPT_RULE_CHANGE,
  ACCEPT_RULE_REMOVAL,
  OPT_OUT_KINDS,
  acceptKind,
  acceptBlockedReason,
  dismissBlockedReason,
  dismissDetachesRule,
  patchFromOfficial,
  markBefore,
  optOutKey,
  hasOptOut,
};