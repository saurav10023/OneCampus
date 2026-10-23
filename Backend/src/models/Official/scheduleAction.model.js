import mongoose, { Schema } from 'mongoose';
import { ACTION_TARGET, ACTION_OP, SCHEDULE_ROLE } from '../../utils/constants.js';

const scheduleActionSchema = new Schema(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OfficialSchedule', required: true },
    // The schedule revision this action created. Students see actions in this order.
    seq: { type: Number, required: true, min: 1 },
    target: {
      kind: { type: String, enum: Object.values(ACTION_TARGET), required: true },
      id: { type: Schema.Types.ObjectId, required: true },
    },
    op: { type: String, enum: Object.values(ACTION_OP), required: true },
    // Snapshots from utils/scheduleActions.js. null = "does not exist".
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },

    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, enum: Object.values(SCHEDULE_ROLE), required: true },
    // A short sentence for the student's "Official updates" list
    summary: { type: String, trim: true, maxlength: 200, default: '' },
    // Why, as the CR or admin wrote it
    note: { type: String, trim: true, maxlength: 500, default: '' },
    // How many students the impact preview said this would reach
    affectedStudents: { type: Number, default: null, min: 0 },

    // For an undo: the action it reverses. An undo of an undo is a redo.
    undoes: { type: Schema.Types.ObjectId, ref: 'ScheduleAction', default: null },
    // Set later, when something undoes this action. The only field that is ever changed.
    undoneBy: { type: Schema.Types.ObjectId, ref: 'ScheduleAction', default: null },
  },
  { timestamps: true }
);

scheduleActionSchema.index({ scheduleId: 1, seq: 1 }, { unique: true });
scheduleActionSchema.index({ scheduleId: 1, 'target.kind': 1, 'target.id': 1, seq: 1 });

const ScheduleAction = mongoose.model('ScheduleAction', scheduleActionSchema);
export default ScheduleAction;