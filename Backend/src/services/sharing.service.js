import mongoose from 'mongoose';
import Setup from '../models/TimeTable/setup.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import RecurringRule from '../models/TimeTable/recurringRule.model.js';
import CalendarEvent from '../models/Calendar/calendarEvent.model.js';
import SharedPublication from '../models/Sharing/sharedPublication.model.js';
import { generateOccurrences } from './occurrence.service.js';

// Structure only, never attendance or user data
const buildSnapshot = async (setup) => {
  const [subjects, rules, events] = await Promise.all([
    Subject.find({ setupId: setup._id }).sort({ name: 1 }),
    RecurringRule.find({ setupId: setup._id, isActive: true }),
    // The student's own confirmed events only (official events come from the schedule)
    CalendarEvent.find({ setupId: setup._id, confirmedAt: { $ne: null }, source: 'manual' }),
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
    subjects: subjects.map((s) => ({ key: String(s._id), name: s.name, code: s.code ?? null })),
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
      group: r.group ?? null,
      attendanceUnits: r.attendanceUnits,
    })),
    // kept under the old key "holidays" so older publications still load
    holidays: events.map((e) => ({
      name: e.title,
      type: e.type,
      affectsClasses: e.affectsClasses,
      startDate: e.startDate,
      endDate: e.endDate,
      startTime: e.startTime ?? null,
      endTime: e.endTime ?? null,
    })),
  };
};

// Creates the copy. Attendance statuses are never copied
const createSetupFromSnapshot = async ({ snapshot, ownerId, setupId, publicationId, versionNumber }) => {
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
    group: rule.group ?? null,
  }));
  if (rules.length) await RecurringRule.insertMany(rules);

  // Drafts (confirmedAt null): they cancel nothing until the student reviews and confirms them
  const events = (snapshot.holidays ?? []).map((h) => ({
    setupId,
    title: h.name,
    type: h.type ?? 'holiday',
    affectsClasses: h.affectsClasses ?? true,
    startDate: h.startDate,
    endDate: h.endDate,
    startTime: h.startTime ?? undefined,
    endTime: h.endTime ?? undefined,
    source: 'manual',
    confirmedAt: null,
  }));
  if (events.length) await CalendarEvent.insertMany(events);

  await generateOccurrences(setupId, setup.startDate, setup.endDate);
  return setup;
};

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
          $cond: [{ $gt: ['$ratingCount', 0] }, { $divide: ['$ratingSum', '$ratingCount'] }, 0],
        },
      },
    },
  ]);

export { buildSnapshot, createSetupFromSnapshot, applyRatingDelta };