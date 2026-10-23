import { ATTENDANCE_STATUS } from './constants.js';

// Pure attendance maths. No database, no mongoose, so it can be tested on its own.
//
// Rules (Gate 2):
//   present            counts in attended and in held
//   absent             counts in held only
//   pending, cancelled, not_counted, excused   count in neither
//   every class counts attendanceUnits (a double period is 2)
//   extra classes: attendedCount -> attended and held, missedCount -> held only,
//                  the rest of totalCount (not yet recorded) counts in neither

const EPS = 1e-9;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const createBucket = () => ({
  attendedUnits: 0,
  heldUnits: 0,
  classes: { present: 0, absent: 0, excused: 0, cancelled: 0, notCounted: 0, pending: 0 },
  // pending classes dated before today: the student has not marked them yet
  unrecordedClasses: 0,
  unrecordedUnits: 0,
  // pending classes dated today or later: still to be decided
  upcomingClasses: 0,
  upcomingUnits: 0,
});

// isUpcoming: the class date is today or later (compared as YYYY-MM-DD text by the caller)
const tallyClass = (bucket, { status, units, isUpcoming }) => {
  switch (status) {
    case ATTENDANCE_STATUS.PRESENT:
      bucket.attendedUnits += units;
      bucket.heldUnits += units;
      bucket.classes.present += 1;
      break;
    case ATTENDANCE_STATUS.ABSENT:
      bucket.heldUnits += units;
      bucket.classes.absent += 1;
      break;
    case ATTENDANCE_STATUS.EXCUSED:
      bucket.classes.excused += 1;
      break;
    case ATTENDANCE_STATUS.CANCELLED:
      bucket.classes.cancelled += 1;
      break;
    case ATTENDANCE_STATUS.NOT_COUNTED:
      bucket.classes.notCounted += 1;
      break;
    default: // pending, or any value nobody should be storing
      bucket.classes.pending += 1;
      if (isUpcoming) {
        bucket.upcomingClasses += 1;
        bucket.upcomingUnits += units;
      } else {
        bucket.unrecordedClasses += 1;
        bucket.unrecordedUnits += units;
      }
  }
};

// One extra-class record counts each class as one unit
// One extra-class record counts each class as one unit.
// Extras that are announced but not yet decided are still to come, so they count as upcoming
// (they can be skipped or attended in the projection) and in neither attended nor held.
const addExtra = (bucket, extra) => {
  if (!extra) return;
  bucket.attendedUnits += extra.attendedCount;
  bucket.heldUnits += extra.attendedCount + extra.missedCount;

  const undecided = Math.max(0, extra.totalCount - extra.attendedCount - extra.missedCount);
  bucket.upcomingClasses += undecided;
  bucket.upcomingUnits += undecided;
};

const mergeBuckets = (buckets) => {
  const total = createBucket();
  for (const b of buckets) {
    total.attendedUnits += b.attendedUnits;
    total.heldUnits += b.heldUnits;
    for (const key of Object.keys(total.classes)) total.classes[key] += b.classes[key];
    total.unrecordedClasses += b.unrecordedClasses;
    total.unrecordedUnits += b.unrecordedUnits;
    total.upcomingClasses += b.upcomingClasses;
    total.upcomingUnits += b.upcomingUnits;
  }
  return total;
};

const percentOf = (attended, held) => (held > 0 ? round2((attended / held) * 100) : null);

// Compared on the exact ratio, not the rounded one, so 74.996 never shows as meeting 75
const meetsTarget = (attended, held, target) =>
  held > 0 ? attended * 100 >= target * held - EPS : null;

// Classes the student must attend in a row, from now, to reach the target.
// 0 = already there. null = impossible (a target of 100 once any class is missed).
const unitsNeeded = (attended, held, target) => {
  if (attended * 100 >= target * held - EPS) return 0;
  if (target >= 100) return null;
  const t = target / 100;
  return Math.ceil((t * held - attended) / (1 - t) - EPS);
};

// What the rest of the semester allows, assuming every upcoming class is attended unless skipped
const projection = (bucket, target) => {
  const A = bucket.attendedUnits;
  const H = bucket.heldUnits;
  const U = bucket.upcomingUnits;
  const t = target / 100;

  const neededUnits = unitsNeeded(A, H, target);
  const canReachTarget = neededUnits !== null && neededUnits <= U;
  const maxBunkableUnits = canReachTarget
    ? Math.min(U, Math.max(0, Math.floor(A + U - t * (H + U) + EPS)))
    : 0;

  return {
    upcomingClasses: bucket.upcomingClasses,
    upcomingUnits: U,
    bestPossiblePercentage: H + U > 0 ? round2(((A + U) / (H + U)) * 100) : null,
    canReachTarget,
    neededUnits,
    maxBunkableUnits,
  };
};

// "What if I miss `count` units?"
const whatIfMissing = (bucket, target, count) => {
  const A = bucket.attendedUnits;
  const H = bucket.heldUnits;
  const U = bucket.upcomingUnits;
  const within = count <= U;

  return {
    count,
    withinUpcoming: within,
    // right after missing them, before anything else happens
    percentageRightAfter: percentOf(A, H + count),
    // at the end of the semester, if every other upcoming class is attended
    endOfSemesterPercentage: within && H + U > 0 ? round2(((A + U - count) / (H + U)) * 100) : null,
    meetsTargetAtEnd: within && H + U > 0 ? (A + U - count) * 100 >= target * (H + U) - EPS : null,
  };
};

const summarize = (bucket, target) => ({
  target,
  attendedUnits: bucket.attendedUnits,
  heldUnits: bucket.heldUnits,
  percentage: percentOf(bucket.attendedUnits, bucket.heldUnits),
  meetsTarget: meetsTarget(bucket.attendedUnits, bucket.heldUnits, target),
  classes: bucket.classes,
  unrecordedClasses: bucket.unrecordedClasses,
  unrecordedUnits: bucket.unrecordedUnits,
  projection: projection(bucket, target),
});

export {
  createBucket,
  tallyClass,
  addExtra,
  mergeBuckets,
  percentOf,
  meetsTarget,
  unitsNeeded,
  projection,
  whatIfMissing,
  summarize,
};