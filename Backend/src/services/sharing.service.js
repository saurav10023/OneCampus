import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import Holiday from '../models/holiday.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import { generateOccurrences } from './occurrence.service.js';

// Safe to publish: structure only, never attendance statuses or user data
const buildSnapshot = async (setup) => {
  const [subjects, rules, holidays] = await Promise.all([
    Subject.find({ setupId: setup._id }).sort({ name: 1 }),
    RecurringRule.find({ setupId: setup._id, isActive: true }),
    // Unconfirmed holidays are drafts the publisher never reviewed
    Holiday.find({ setupId: setup._id, confirmedAt: { $ne: null } }),
  ]);

  return {
    setup: {
      name: setup.name,
      academicYear: setup.academicYear,
      semesterLabel: setup.semesterLabel,
      branch: setup.branch,
      section: setup.section,
      startDate: setup.startDate,
      endDate: setup.endDate,
      timezone: setup.timezone,
    },
    // key links rules to subjects without exposing the publisher's real ids
    subjects: subjects.map((s) => ({
      key: String(s._id),
      name: s.name,
      code: s.code ?? null,
    })),
    recurringRules: rules.map((r) => ({
      subjectKey: String(r.subjectId),
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      effectiveStartDate: r.effectiveStartDate,
      effectiveEndDate: r.effectiveEndDate,
      professor: r.professor ?? null,
      room: r.room ?? null,
      classType: r.classType ?? null,
      attendanceUnits: r.attendanceUnits,
    })),
    holidays: holidays.map((h) => ({
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate,
    })),
  };
};

// Creates the adopter's independent copy. Attendance statuses are never copied
const createSetupFromSnapshot = async ({
  snapshot,
  ownerId,
  setupId,
  publicationId,
  versionNumber,
}) => {
  const setup = await Setup.create({
    _id: setupId,
    ownerId,
    ...snapshot.setup,
    sourcePublicationId: publicationId,
    sourceVersionNumber: versionNumber,
  });

  const subjectIdByKey = new Map();
  const subjects = snapshot.subjects.map((s) => {
    const _id = new mongoose.Types.ObjectId();
    subjectIdByKey.set(s.key, _id);
    return { _id, setupId, name: s.name, code: s.code ?? undefined };
  });
  await Subject.insertMany(subjects);

  const rules = snapshot.recurringRules.map(({ subjectKey, ...rule }) => ({
    ...rule,
    setupId,
    subjectId: subjectIdByKey.get(subjectKey),
    professor: rule.professor ?? undefined,
    room: rule.room ?? undefined,
    classType: rule.classType ?? undefined,
  }));
  if (rules.length) await RecurringRule.insertMany(rules);

  // Left unconfirmed so the adopter reviews them before any class is cancelled
  const holidays = snapshot.holidays.map((h) => ({
    ...h,
    setupId,
    source: 'shared_setup',
    confirmedAt: null,
  }));
  if (holidays.length) await Holiday.insertMany(holidays);

  await generateOccurrences(setupId, setup.startDate, setup.endDate);

  return setup;
};

// Atomic rating update; the average is recomputed in the same database operation
const applyRatingDelta = (publicationId, ratingSumDelta, ratingCountDelta) =>
  SharedPublication.updateOne({ _id: publicationId }, [
    {
      $set: {
        ratingSum: { $max: [0, { $add: ['$ratingSum', ratingSumDelta] }] },
        ratingCount: { $max: [0, { $add: ['$ratingCount', ratingCountDelta] }] },
      },
    },
    {
      $set: {
        ratingAverage: {
          $cond: [
            { $gt: ['$ratingCount', 0] },
            { $divide: ['$ratingSum', '$ratingCount'] },
            0,
          ],
        },
      },
    },
  ]);

export { buildSnapshot, createSetupFromSnapshot, applyRatingDelta };