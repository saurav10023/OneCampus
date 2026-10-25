import mongoose, { Schema } from 'mongoose';

// One line in the student's "Official updates" list: something the CR's schedule did to this setup,
// or wants to do and is waiting for the student. It lives with the student's setup (deleted with it).
// The CR's own history is ScheduleAction. This is what that history meant for ONE student.

const UPDATE_TARGET = Object.freeze({ SUBJECT: 'subject', RULE: 'rule', ITEM: 'item' });
const UPDATE_CHANGE = Object.freeze({ ADDED: 'added', UPDATED: 'updated', WITHDRAWN: 'withdrawn', CONFLICT: 'conflict' });
const UPDATE_STATUS = Object.freeze({
  APPLIED: 'applied', // done automatically
  PENDING: 'pending', // waiting for the student: a changed or removed weekly class, a clash to resolve
  DISMISSED: 'dismissed', // the student said no for this revision
  SUPERSEDED: 'superseded', // a newer change replaced it
});

const setupOfficialUpdateSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OfficialSchedule', required: true },

    // The CR's record this is about: a ScheduleSubject, ScheduleRule or ScheduleItem
    targetKind: { type: String, enum: Object.values(UPDATE_TARGET), required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    change: { type: String, enum: Object.values(UPDATE_CHANGE), required: true },
    // The official revision this refers to
    revision: { type: Number, required: true, min: 0 },

    status: { type: String, enum: Object.values(UPDATE_STATUS), required: true },
    summary: { type: String, trim: true, maxlength: 300, default: '' },
    // For a pending class change: the values the student would get by accepting
    proposed: { type: Schema.Types.Mixed, default: null },
    // Anything else worth showing (counts, a reason)
    data: { type: Schema.Types.Mixed, default: null },

    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// A repeated sync can never write the same line twice, and a dismissed line is never recreated
// for the same revision
setupOfficialUpdateSchema.index(
  { setupId: 1, targetKind: 1, targetId: 1, change: 1, revision: 1 },
  { unique: true }
);
setupOfficialUpdateSchema.index({ setupId: 1, status: 1, createdAt: -1 });

const SetupOfficialUpdate = mongoose.model('SetupOfficialUpdate', setupOfficialUpdateSchema);

export { UPDATE_TARGET, UPDATE_CHANGE, UPDATE_STATUS };
export default SetupOfficialUpdate;