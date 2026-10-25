import { clampRuleRange } from './officialJoinRules.js';

// Pure rules for syncing a student's setup with its official schedule. No database.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayText = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);
const norm = (value) => (value === undefined || value === '' ? null : value);
const sameDate = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

// The first revision to re-read. A few revisions before the last one are read again, because two
// CR edits can commit out of order and the later number may be seen first. Re-reading is safe:
// every sync step is repeatable.
const syncWindowStart = (lastSynced, overlap) => Math.max(0, (lastSynced ?? 0) - overlap);

// Items the student deleted (Setup.officialOptOuts: [{ kind, id }])
const optOutSet = (optOuts) => new Set((optOuts ?? []).map((o) => `${o.kind}:${o.id}`));
const isOptedOut = (set, kind, id) => set.has(`${kind}:${id}`);

// Fields of a weekly class the CR controls. Changing any of them is offered to the student.
const RULE_COMPARE = ['weekday', 'startTime', 'endTime', 'classType', 'group', 'attendanceUnits', 'room', 'professor'];

// Which fields differ between the official class and the student's copy. Official dates are
// compared after fitting them into the student's setup, exactly as the join did.
const diffRuleAgainstStudent = (official, student, { setupStart, setupEnd }) => {
  const changed = RULE_COMPARE.filter((f) => norm(official[f]) !== norm(student[f]));
  const range = clampRuleRange(official, setupStart, setupEnd);
  if (range) {
    if (!sameDate(range.start, student.effectiveStartDate)) changed.push('effectiveStartDate');
    if (!sameDate(range.end, student.effectiveEndDate)) changed.push('effectiveEndDate');
  }
  return changed;
};

// What the student would get by accepting the change
const ruleProposal = (official) => ({
  entryType: official.entryType,
  weekday: official.weekday,
  startTime: official.startTime,
  endTime: official.endTime,
  classType: official.classType,
  group: official.group ?? null,
  room: norm(official.room),
  professor: norm(official.professor),
  attendanceUnits: official.attendanceUnits,
  effectiveStartDate: dayText(official.effectiveStartDate),
  effectiveEndDate: dayText(official.effectiveEndDate),
});

const describeOfficialRule = (rule, subjectName = 'Class') => {
  const when = rule.entryType === 'makeup' ? `makeup ${dayText(rule.effectiveStartDate)}` : WEEKDAYS[rule.weekday];
  return `${subjectName} ${when} ${rule.startTime}-${rule.endTime}${rule.group ? ` (${rule.group})` : ''}`;
};

// The calendar event fields that follow an official item
const eventPatchFromItem = (item) => ({
  title: item.title,
  startDate: item.startDate,
  endDate: item.endDate,
  startTime: item.startTime ?? null,
  endTime: item.endTime ?? null,
  note: item.note || null,
});

const eventNeedsUpdate = (event, item) => {
  const patch = eventPatchFromItem(item);
  return (
    event.title !== patch.title ||
    !sameDate(event.startDate, patch.startDate) ||
    !sameDate(event.endDate, patch.endDate) ||
    norm(event.startTime) !== patch.startTime ||
    norm(event.endTime) !== patch.endTime ||
    norm(event.note) !== patch.note
  );
};

export {
  syncWindowStart,
  optOutSet,
  isOptedOut,
  RULE_COMPARE,
  diffRuleAgainstStudent,
  ruleProposal,
  describeOfficialRule,
  eventPatchFromItem,
  eventNeedsUpdate,
};