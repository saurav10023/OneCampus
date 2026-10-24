import ApiError from '../utils/ApiError.js';
import OfficialSchedule from '../models/Official/officialSchedule.model.js';
import ScheduleAction from '../models/Official/scheduleAction.model.js';

// Takes the next revision number. One atomic increment, so two CR edits can never share one.
const allocateRevision = async (scheduleId) => {
  const updated = await OfficialSchedule.findOneAndUpdate(
    { _id: scheduleId },
    { $inc: { contentRevision: 1 } },
    { new: true }
  )
    .select('contentRevision')
    .lean();
  if (!updated) throw new ApiError(404, 'Schedule not found');
  return updated.contentRevision;
};

// Writes the log entry for a change that has already been saved at revision `seq`
const recordAction = ({ scheduleId, seq, target, op, before = null, after = null, actor, summary = '', note = '', affectedStudents = null, undoes = null }) =>
  ScheduleAction.create({
    scheduleId,
    seq,
    target,
    op,
    before,
    after,
    actorId: actor.userId,
    actorRole: actor.role,
    summary,
    note,
    affectedStudents,
    undoes,
  });

export { allocateRevision, recordAction };