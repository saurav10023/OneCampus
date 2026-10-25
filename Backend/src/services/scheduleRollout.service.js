import Setup from '../models/TimeTable/setup.model.js';
import SetupOfficialUpdate, { UPDATE_STATUS } from '../models/Official/setupOfficialUpdate.model.js';
import { buildRollout } from '../utils/rolloutRules.js';
import { loadEditableSchedule } from './officialSchedule.service.js';

// For the CR: did my changes reach the students? Counts only. No student is named, and no
// attendance is read. Only a CR of this class or a college admin may ask (loadEditableSchedule).
// An archived schedule can still be looked at.

// A class has about 60 students. The limit only protects the server from a mistake.
const MAX_SETUPS = 5000;

const getRollout = async ({ user, scheduleId }) => {
  const { schedule } = await loadEditableSchedule({ user, scheduleId, allowArchived: true });
  const plain = typeof schedule.toObject === 'function' ? schedule.toObject() : schedule;

  const [setups, pendingRows] = await Promise.all([
    Setup.find({ officialScheduleId: plain._id })
      .select('status lastSyncedContentRevision officialGroups')
      .limit(MAX_SETUPS)
      .lean(),
    SetupOfficialUpdate.aggregate([
      { $match: { scheduleId: plain._id, status: UPDATE_STATUS.PENDING } },
      { $group: { _id: { setupId: '$setupId', kind: '$targetKind', change: '$change' }, n: { $sum: 1 } } },
    ]),
  ]);

  return {
    schedule: {
      id: plain._id,
      status: plain.status,
      latestRevision: plain.contentRevision,
      publishedAt: plain.publishedAt ?? null,
    },
    ...buildRollout({ schedule: plain, setups, pendingRows }),
    generatedAt: new Date(),
  };
};

export { getRollout };