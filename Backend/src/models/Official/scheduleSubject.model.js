import mongoose, { Schema } from 'mongoose';
import { ITEM_STATUS } from '../../utils/constants.js';

const toNameKey = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

const scheduleSubjectSchema = new Schema(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OfficialSchedule', required: true },
    // The stable id a student's Subject.officialKey stores. Defaults to the record's own id, so it
    // never changes when the name or code is edited.
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    nameKey: { type: String, required: true },
    code: {
      type: String,
      set: (value) => {
        const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return normalized || undefined;
      },
      match: [/^[A-Z0-9][A-Z0-9 ._/-]{0,19}$/, 'Subject code can have up to 20 letters, numbers, spaces, dots, dashes, slashes or underscores'],
    },
    status: { type: String, enum: Object.values(ITEM_STATUS), default: ITEM_STATUS.ACTIVE },
    // The schedule's contentRevision when this record was last written
    revision: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

scheduleSubjectSchema.pre('validate', function () {
  if (!this.key) this.key = String(this._id);
  this.nameKey = toNameKey(this.name);
});

scheduleSubjectSchema.index({ scheduleId: 1, key: 1 }, { unique: true });
// No two active subjects with the same name or code in one schedule
scheduleSubjectSchema.index({ scheduleId: 1, nameKey: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
scheduleSubjectSchema.index(
  { scheduleId: 1, code: 1 },
  { unique: true, partialFilterExpression: { status: 'active', code: { $type: 'string' } } }
);
// Sync: everything changed after a revision
scheduleSubjectSchema.index({ scheduleId: 1, revision: 1 });

const ScheduleSubject = mongoose.model('ScheduleSubject', scheduleSubjectSchema);
export default ScheduleSubject;