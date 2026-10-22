import Subject from '../models/TimeTable/subject.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import ExtraClassAdjustment from '../models/Attendance/extraClassAdjustment.model.js';
import { DEFAULT_TARGET_PERCENTAGE } from '../utils/constants.js';
import {
  createBucket,
  tallyClass,
  addExtra,
  mergeBuckets,
  summarize,
  whatIfMissing,
} from '../utils/attendanceMath.js';

// Today's date in the setup's timezone, as YYYY-MM-DD
const todayIn = (timezone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

// Reads one setup's classes and the user's marks, and works out every number in one pass.
// Four queries, no matter how many subjects. A setup holds hundreds of classes, so doing the
// tally in memory is cheap and easy to test.
const getAttendance = async ({ setup, userId, includeArchived = false }) => {
  const setupTarget = setup.targetPercentage ?? DEFAULT_TARGET_PERCENTAGE;
  const today = todayIn(setup.timezone);

  const [subjects, occurrences, rows, adjustments] = await Promise.all([
    Subject.find({ setupId: setup._id }).select('name code color targetPercentage isActive').lean(),
    Occurrence.find({ setupId: setup._id }).select('subjectId date attendanceUnits').lean(),
    OccurrenceStatus.find({ userId, setupId: setup._id }).select('occurrenceId status').lean(),
    ExtraClassAdjustment.find({ setupId: setup._id }).lean(),
  ]);

  const statusByOccurrence = new Map(rows.map((r) => [String(r.occurrenceId), r.status]));
  const adjustmentBySubject = new Map(adjustments.map((a) => [String(a.subjectId), a]));
  const bucketBySubject = new Map(subjects.map((s) => [String(s._id), createBucket()]));

  for (const occurrence of occurrences) {
    const bucket = bucketBySubject.get(String(occurrence.subjectId));
    if (!bucket) continue; // a class whose subject is gone is ignored
    tallyClass(bucket, {
      status: statusByOccurrence.get(String(occurrence._id)) ?? 'pending',
      units: occurrence.attendanceUnits ?? 1,
      isUpcoming: occurrence.date.toISOString().slice(0, 10) >= today,
    });
  }

  const subjectResults = subjects
    .map((subject) => {
      const id = String(subject._id);
      const bucket = bucketBySubject.get(id);
      const extra = adjustmentBySubject.get(id) ?? null;
      addExtra(bucket, extra);

      const hasOwnTarget = subject.targetPercentage !== null && subject.targetPercentage !== undefined;
      const target = hasOwnTarget ? subject.targetPercentage : setupTarget;

      return {
        bucket,
        result: {
          subject: {
            id: subject._id,
            name: subject.name,
            code: subject.code ?? null,
            color: subject.color ?? null,
            isActive: subject.isActive !== false,
          },
          targetSource: hasOwnTarget ? 'subject' : 'setup',
          ...summarize(bucket, target),
          extra: extra
            ? {
                totalCount: extra.totalCount,
                attendedCount: extra.attendedCount,
                missedCount: extra.missedCount,
                unrecordedCount: extra.totalCount - extra.attendedCount - extra.missedCount,
              }
            : null,
        },
      };
    })
    .sort((a, b) => a.result.subject.name.localeCompare(b.result.subject.name));

  const included = subjectResults.filter(
    (entry) => includeArchived || entry.result.subject.isActive
  );
  const overallBucket = mergeBuckets(included.map((entry) => entry.bucket));

  return {
    asOf: today,
    includesArchived: includeArchived,
    overall: { ...summarize(overallBucket, setupTarget), subjectsCounted: included.length },
    subjects: subjectResults.map((entry) => entry.result),
    // kept for the what-if calculation, not sent to clients
    _buckets: {
      overall: { bucket: overallBucket, target: setupTarget },
      bySubject: new Map(
        subjectResults.map((entry) => [
          String(entry.result.subject.id),
          { bucket: entry.bucket, target: entry.result.target },
        ])
      ),
    },
  };
};

// "Can I miss N classes?" for the whole setup, or one subject
const checkBunk = async ({ setup, userId, count, subjectId = null, includeArchived = false }) => {
  const data = await getAttendance({ setup, userId, includeArchived });
  const scope = subjectId ? data._buckets.bySubject.get(String(subjectId)) : data._buckets.overall;
  if (!scope) return null; // unknown subject

  const summary = summarize(scope.bucket, scope.target);
  return {
    asOf: data.asOf,
    scope: subjectId ? 'subject' : 'overall',
    target: scope.target,
    percentage: summary.percentage,
    projection: summary.projection,
    whatIf: whatIfMissing(scope.bucket, scope.target, count),
  };
};

const stripInternal = ({ _buckets, ...data }) => data;

export { getAttendance, checkBunk, stripInternal, todayIn };