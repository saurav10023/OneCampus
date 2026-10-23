import { DAY_MS } from './constants.js';

// Pure rules for ExtraClassAdjustment counters. No database, so they can be tested on their own.
//
//   totalCount     extra classes the student knows about
//   attendedCount  of those, attended
//   missedCount    of those, missed
//   unrecorded     totalCount - attendedCount - missedCount (not yet decided, counts nowhere
//                  in the percentage, but counts as upcoming in the projection)

const MAX_COUNT = 500;
const MAX_NOTE = 300;
const MAX_COLLEGE_COUNT = 5000;
// A fresh setup is only worth a "do you already have classes?" prompt after this many days
const SUGGEST_AFTER_DAYS = 7;

const unrecordedOf = (c) => c.totalCount - c.attendedCount - c.missedCount;

// Every problem with a full set of counters, as messages
const checkCounts = ({ totalCount, attendedCount, missedCount }) => {
  const errors = [];
  for (const [name, value] of [
    ['totalCount', totalCount],
    ['attendedCount', attendedCount],
    ['missedCount', missedCount],
  ]) {
    if (!Number.isInteger(value) || value < 0) errors.push(`${name} cannot go below 0`);
    else if (value > MAX_COUNT) errors.push(`${name} cannot be above ${MAX_COUNT}`);
  }
  if (attendedCount + missedCount > totalCount) {
    errors.push('attendedCount + missedCount cannot exceed totalCount');
  }
  return errors;
};

// delta: { attended, missed, unrecorded }, each a whole number, positive or negative.
//   attended: +1                  an extra class held and attended
//   missed: +1                    an extra class held and missed
//   unrecorded: +1                an extra class announced, outcome not known yet
//   attended: +1, unrecorded: -1  outcome of an announced class turned out to be attended
const applyDelta = (base, delta) => {
  const attended = delta.attended ?? 0;
  const missed = delta.missed ?? 0;
  const unrecorded = delta.unrecorded ?? 0;
  const next = {
    attendedCount: base.attendedCount + attended,
    missedCount: base.missedCount + missed,
    totalCount: base.totalCount + attended + missed + unrecorded,
  };
  return { next, errors: checkCounts(next) };
};

const sameCounts = (a, b) =>
  a.totalCount === b.totalCount &&
  a.attendedCount === b.attendedCount &&
  a.missedCount === b.missedCount;

// "Match my college record": works out the extra-class counters that make the app agree with the
// college's own numbers for one subject. The counters can only add to the timetable's totals,
// never take away, so a college figure lower than the app's cannot be matched this way.
//   timetableAttended / timetableHeld   the subject's totals from timetable classes only
//   collegeAttended / collegeHeld       what the college's record says
//   unrecordedExtras                    announced extras to keep (they do not change the match)
const matchCollegeRecord = ({
  timetableAttended,
  timetableHeld,
  collegeAttended,
  collegeHeld,
  unrecordedExtras = 0,
}) => {
  if (collegeAttended > collegeHeld) {
    return { next: null, errors: ['The college\'s attended classes cannot be more than its held classes'] };
  }

  const attendedCount = collegeAttended - timetableAttended;
  const timetableMissed = timetableHeld - timetableAttended;
  const collegeMissed = collegeHeld - collegeAttended;
  const missedCount = collegeMissed - timetableMissed;

  const errors = [];
  if (attendedCount < 0) {
    errors.push(
      `Your marks already show ${timetableAttended} attended, which is more than the college's ` +
        `${collegeAttended}. Correct your marks first.`
    );
  }
  if (missedCount < 0) {
    errors.push(
      `Your marks already show ${timetableMissed} missed, which is more than the college's ` +
        `${collegeMissed}. Correct your marks first.`
    );
  }
  if (errors.length) return { next: null, errors };

  const next = {
    attendedCount,
    missedCount,
    totalCount: attendedCount + missedCount + unrecordedExtras,
  };
  return { next, errors: checkCounts(next) };
};

// Show the "do you already have classes recorded?" prompt: nothing entered yet, no marks made,
// and the setup started a while ago
const shouldSuggestStartingBalance = ({ adjustmentCount, setupStart, today, hasMarks }) => {
  if (adjustmentCount > 0 || hasMarks) return false;
  return (today.getTime() - setupStart.getTime()) / DAY_MS >= SUGGEST_AFTER_DAYS;
};

export {
  MAX_COUNT,
  MAX_NOTE,
  MAX_COLLEGE_COUNT,
  unrecordedOf,
  checkCounts,
  applyDelta,
  sameCounts,
  matchCollegeRecord,
  shouldSuggestStartingBalance,
};