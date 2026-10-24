// Pure clash detection for the CR's weekly and makeup classes. No database.
// A rule here: { weekday, startTime, endTime, group, effectiveStartDate, effectiveEndDate, status }
// A weekly class with no dates runs the whole semester. A makeup class has one date.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Zero-padded HH:mm strings compare correctly as text
const timesOverlap = (a, b) => a.startTime < b.endTime && b.startTime < a.endTime;

// Two different named groups never clash: a student belongs to one batch
const groupsClash = (a, b) => !(a.group && b.group && a.group !== b.group);

// A class with no dates runs the whole semester, so it overlaps every date range
const datesOverlap = (a, b) => {
  if (!a.effectiveStartDate || !b.effectiveStartDate) return true;
  return a.effectiveStartDate <= b.effectiveEndDate && b.effectiveStartDate <= a.effectiveEndDate;
};

const rulesClash = (a, b) =>
  a.weekday === b.weekday && timesOverlap(a, b) && groupsClash(a, b) && datesOverlap(a, b);

// The active rules in `others` that clash with `candidate`. The candidate itself is skipped.
const findRuleClashes = (candidate, others) =>
  others.filter(
    (o) =>
      String(o._id) !== String(candidate._id ?? '') &&
      o.status !== 'withdrawn' &&
      rulesClash(candidate, o)
  );

const dayText = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

// "Maths Mon 09:00-10:00 (b1)" or "Maths makeup 2026-10-24 09:00-10:00"
const describeRule = (rule, subjectName) => {
  const when =
    rule.entryType === 'makeup'
      ? `makeup ${dayText(rule.effectiveStartDate)}`
      : WEEKDAYS[rule.weekday];
  return `${subjectName} ${when} ${rule.startTime}-${rule.endTime}${rule.group ? ` (${rule.group})` : ''}`;
};

export { timesOverlap, groupsClash, datesOverlap, rulesClash, findRuleClashes, describeRule };