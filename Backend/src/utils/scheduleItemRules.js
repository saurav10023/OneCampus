// Pure rules for official schedule items: no database and no imports, so they can be tested alone.
// The ScheduleItem model already checks the shape of one item (which kinds need times, a subject
// or a slot). These helpers cover what the model cannot: wording for the action log, warnings, and
// which references need a database check after an edit.

const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_LABEL = Object.freeze({
  holiday: 'holiday',
  break: 'break',
  last_working_day: 'last working day',
  event: 'event',
  quiz: 'quiz',
  exam: 'exam',
  mass_bunk: 'mass bunk',
  class_cancel: 'class cancel',
});

// What an edit may change. The kind never changes: withdraw the item and create a new one.
const ITEM_UPDATE_FIELDS = Object.freeze([
  'title',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'subjectKey',
  'slotKey',
  'classType',
  'group',
  'note',
]);

// null on these means "remove it"
const CLEARABLE_FIELDS = Object.freeze([
  'startTime',
  'endTime',
  'subjectKey',
  'slotKey',
  'classType',
  'group',
  'note',
]);

const labelOf = (kind) => KIND_LABEL[kind] ?? kind;

const dateText = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : null;

const spanDays = (start, end) => Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

// Only a quiz or an exam holds a slot that may be used once
const isSlotKind = (kind) => kind === 'quiz' || kind === 'exam';

// A short phrase for the action log, for example: exam "Mid-sem" from 2026-10-12 to 2026-10-19
const describeItem = (item) => {
  const start = dateText(item.startDate);
  const end = dateText(item.endDate);
  let when = '';
  if (start && end && start !== end) when = ` from ${start} to ${end}`;
  else if (start) when = ` on ${start}`;
  return `${labelOf(item.kind)} "${item.title}"${when}`;
};

// Warnings that never block a save: a date outside the semester, or a very long range.
// item: { kind, startDate, endDate }. schedule: { semesterStart, semesterEnd } (either may be null).
const itemWarnings = (item, schedule, longRangeDays) => {
  const warnings = [];
  const label = labelOf(item.kind);

  const { semesterStart, semesterEnd } = schedule;
  if (semesterStart && semesterEnd && (item.startDate < semesterStart || item.endDate > semesterEnd)) {
    warnings.push(
      `This ${label} falls outside the schedule's semester dates (${dateText(semesterStart)} to ${dateText(semesterEnd)}).`
    );
  }

  const days = spanDays(item.startDate, item.endDate);
  if (days > longRangeDays) {
    warnings.push(`This ${label} covers ${days} days. Check the dates are right.`);
  }
  return warnings;
};

const nil = (value) => (value === undefined || value === '' ? null : value);

// Which references changed between two states of an item, so an edit only checks what it touched
// (a note change must not fail because a subject was withdrawn earlier).
// current and next: { subjectKey, group, slotKey }
const changedRefs = (current, next) => {
  const subject = nil(current.subjectKey) !== nil(next.subjectKey);
  const group = nil(current.group) !== nil(next.group);
  const slot = subject || nil(current.slotKey) !== nil(next.slotKey);
  return { subject, group, slot };
};

const ALL_REFS_CHANGED = Object.freeze({ subject: true, group: true, slot: true });

// The 409 message when a quiz or exam slot is already taken. subjectName is null for an exam that
// covers every subject.
const slotConflictMessage = ({ kind, slotKey, subjectName }) =>
  subjectName
    ? `${subjectName} already has an active ${labelOf(kind)} in slot ${slotKey}`
    : `An active ${labelOf(kind)} for every subject already exists in slot ${slotKey}`;

export {
  KIND_LABEL,
  ITEM_UPDATE_FIELDS,
  CLEARABLE_FIELDS,
  ALL_REFS_CHANGED,
  labelOf,
  dateText,
  spanDays,
  isSlotKind,
  describeItem,
  itemWarnings,
  changedRefs,
  slotConflictMessage,
};