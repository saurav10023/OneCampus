import ScheduleItem from '../models/Official/scheduleItem.model.js';
import ScheduleSubject from '../models/Official/scheduleSubject.model.js';
import Setup from '../models/TimeTable/setup.model.js';
import Subject from '../models/TimeTable/subject.model.js';
import Occurrence from '../models/Schedule/occurrence.model.js';
import OccurrenceStatus from '../models/Attendance/occurrenceStatus.model.js';
import ApiError from '../utils/ApiError.js';
import { validateOrThrow } from '../utils/saveOrThrow.js';
import { dateText } from '../utils/scheduleItemRules.js';
import { loadEditableSchedule, countAttachedStudents } from './officialSchedule.service.js';
import { ATTENDANCE_STATUS, ITEM_STATUS } from '../utils/constants.js';

// Impact preview: "if I publish this item, how many students and classes does it reach?"
// A dry run. It reads and counts; it never writes, takes no revision and logs nothing.
//
// Two ways to call it:
//   { itemId }                      an item already in this schedule (for example before withdrawing it)
//   { kind, startDate, ... }        the fields of an item not yet created (same shape as creating one)
//
// Only kinds that cancel classes (holiday, break, exam, mass bunk, class cancel) reach any class. A quiz,
// an event and a last working day reach students but cancel nothing, so they report 0 classes.

// A student's own marks. An official cancellation still takes these classes: the sync remembers the
// mark and gives it back if the item is withdrawn. They are counted so the CR knows how many marks are held.
const STUDENT_MARKS = [ATTENDANCE_STATUS.PRESENT, ATTENDANCE_STATUS.ABSENT, ATTENDANCE_STATUS.EXCUSED];
// Classes that are already held and are skipped
const ALREADY_HELD = [ATTENDANCE_STATUS.CANCELLED, ATTENDANCE_STATUS.NOT_COUNTED];

// Setup.officialScheduleId and Setup.officialGroups must exist in the Setup schema: an unknown field in
// a query filter can be dropped by Mongoose, which would count every setup.
const assertSetupFields = () => {
  for (const path of ['officialScheduleId', 'officialGroups']) {
    if (!Setup.schema.path(path)) throw new Error(`Setup.${path} is not defined in the Setup schema`);
  }
};

const emptyResult = ({ attachedStudents, scopedStudents, note }) => ({
  attachedStudents,
  affectedStudents: 0,
  scopedStudents,
  classes: 0,
  markedClasses: 0,
  alreadyHeldClasses: 0,
  note,
});

// The item to measure: an existing one, or a new one built from the input and checked by the model
const resolveItem = async ({ schedule, input }) => {
  if (input.itemId) {
    const item = await ScheduleItem.findOne({ _id: input.itemId, scheduleId: schedule._id }).lean();
    if (!item) throw new ApiError(404, 'Item not found');
    return item;
  }

  const draft = new ScheduleItem({
    scheduleId: schedule._id,
    kind: input.kind,
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    subjectKey: input.subjectKey ?? null,
    slotKey: input.slotKey ?? null,
    classType: input.classType ?? null,
    group: input.group ?? null,
    status: ITEM_STATUS.ACTIVE,
  });
  await validateOrThrow(draft); // the same rules as creating it (times, one date, slot...)

  if (draft.subjectKey) {
    const exists = await ScheduleSubject.exists({ scheduleId: schedule._id, key: draft.subjectKey, status: ITEM_STATUS.ACTIVE });
    if (!exists) throw new ApiError(400, 'That subject is not an active subject of this schedule');
  }
  if (draft.group && !schedule.groups.some((g) => g.key === draft.group)) {
    throw new ApiError(400, `Group "${draft.group}" is not in this schedule`);
  }
  return draft.toObject();
};

// input: { itemId } or the fields of a new item (already cleaned by the validator)
const previewImpact = async ({ user, scheduleId, input }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  assertSetupFields();

  const item = await resolveItem({ schedule, input });
  const attachedStudents = await countAttachedStudents(schedule._id);

  // Students in scope: everyone attached, or only those who picked the item's group
  const setupFilter = { officialScheduleId: schedule._id };
  if (item.group) setupFilter.officialGroups = item.group;
  const setups = await Setup.find(setupFilter).select('_id').lean();
  const scopedStudents = setups.length;

  const summary = {
    item: { kind: item.kind, title: item.title, startDate: dateText(item.startDate), endDate: dateText(item.endDate) },
  };

  if (!item.affectsClasses) {
    return {
      ...summary,
      ...emptyResult({ attachedStudents, scopedStudents, note: `A ${item.kind.replace(/_/g, ' ')} does not cancel any classes.` }),
      affectedStudents: scopedStudents,
    };
  }
  if (!scopedStudents) {
    return { ...summary, ...emptyResult({ attachedStudents, scopedStudents, note: 'No attached student is in scope.' }) };
  }

  const setupIds = setups.map((s) => s._id);
  const query = { setupId: { $in: setupIds }, date: { $gte: item.startDate, $lte: item.endDate } };

  // A subject is matched through each student's own copy of it (Subject.officialKey)
  if (item.subjectKey) {
    const subjects = await Subject.find({ setupId: { $in: setupIds }, officialKey: item.subjectKey }).select('_id').lean();
    query.subjectId = { $in: subjects.map((s) => s._id) }; // an empty list matches nothing, never everything
  }
  if (item.classType) query.classType = item.classType;
  if (item.group) query.group = item.group;
  // Two HH:mm ranges overlap when each starts before the other ends (zero-padded text compares correctly)
  if (item.startTime && item.endTime) {
    query.plannedStartTime = { $lt: item.endTime };
    query.plannedEndTime = { $gt: item.startTime };
  }

  const [row] = await Occurrence.aggregate([
    { $match: query },
    { $lookup: { from: OccurrenceStatus.collection.name, localField: '_id', foreignField: 'occurrenceId', as: 'statuses' } },
    {
      $group: {
        _id: null,
        classes: { $sum: 1 },
        students: { $addToSet: '$setupId' },
        marked: { $sum: { $cond: [{ $anyElementTrue: [{ $map: { input: '$statuses', as: 's', in: { $in: ['$$s.status', STUDENT_MARKS] } } }] }, 1, 0] } },
        held: { $sum: { $cond: [{ $anyElementTrue: [{ $map: { input: '$statuses', as: 's', in: { $in: ['$$s.status', ALREADY_HELD] } } }] }, 1, 0] } },
      },
    },
  ]);

  return {
    ...summary,
    attachedStudents,
    scopedStudents,
    affectedStudents: row ? row.students.length : 0,
    classes: row?.classes ?? 0,
    markedClasses: row?.marked ?? 0,
    alreadyHeldClasses: row?.held ?? 0,
    note: row
      ? 'Classes a student already marked are cancelled too; their mark is remembered and comes back if this item is withdrawn. Classes already cancelled or not counted are skipped.'
      : 'No class of any attached student matches.',
  };
};

export { previewImpact };