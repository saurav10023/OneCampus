import mongoose, { Schema } from 'mongoose';
import {
  ATTENDANCE_STATUS,
  STATUS_SOURCE,
  CAUSE_TYPE,
  CAUSE_TYPE_TO_SOURCE,
} from '../../utils/constants.js';

const STATUS_VALUES = Object.values(ATTENDANCE_STATUS);
const SOURCE_VALUES = Object.values(STATUS_SOURCE);
const CAUSE_VALUES = Object.values(CAUSE_TYPE);

// Sources that only exist because a cause holds the class. A row with one of these
// and no cause could never be undone.
const CAUSE_ONLY_SOURCES = Object.freeze(Object.values(CAUSE_TYPE_TO_SOURCE));

const occurrenceStatusSchema = new Schema(
  {
    occurrenceId: {
      type: Schema.Types.ObjectId,
      ref: 'Occurrence',
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 'excused' is a student-set leave: a user mark with no cause, kept by the sync.
    status: {
      type: String,
      enum: STATUS_VALUES,
      required: true,
      default: ATTENDANCE_STATUS.PENDING,
    },
    // What the status was before the system changed it (not_counted, or cancelled by a cause),
    // so it can be restored
    previousStatus: { type: String, enum: [...STATUS_VALUES, null], default: null },
    reason: { type: String, trim: true, default: null },
    source: { type: String, enum: SOURCE_VALUES, default: STATUS_SOURCE.USER },
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },

    // Why this class is cancelled, so removing or undoing the cause can restore it cleanly.
    // causeId points at a CalendarEvent (causeType 'calendar_event'), a MassBunk ('mass_bunk')
    // or a ScheduleClassCancel ('class_cancel').
    // Both are null for classes the student cancelled themselves.
    causeType: { type: String, enum: [...CAUSE_VALUES, null], default: null },
    causeId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// NOTE: bulk writes (updateMany, bulkWrite) skip this hook. Services must set causeType,
// causeId, source and previousStatus together themselves.
occurrenceStatusSchema.pre('validate', function (next) {
  const hasType = this.causeType !== null && this.causeType !== undefined;
  const hasId = this.causeId !== null && this.causeId !== undefined;

  // The two cause fields go together
  if (hasType !== hasId) {
    this.invalidate('causeId', 'causeType and causeId must be set together');
  }

  if (hasType && hasId) {
    // Only a cancelled class has a cause. When the student marks it themselves
    // (present, absent, excused), clear the cause.
    if (this.status !== ATTENDANCE_STATUS.CANCELLED) {
      this.invalidate('status', 'A class with a cancellation cause must have status cancelled');
    }
    const expectedSource = CAUSE_TYPE_TO_SOURCE[this.causeType];
    if (this.source !== expectedSource) {
      this.invalidate(
        'source',
        `A ${this.causeType} cancellation must have source ${expectedSource}`
      );
    }
  } else if (CAUSE_ONLY_SOURCES.includes(this.source)) {
    // A holiday, mass bunk or class cancel row with no cause could never be undone
    this.invalidate('causeId', `Source ${this.source} needs a cause`);
  }
});

// One current status per user and occurrence
occurrenceStatusSchema.index({ occurrenceId: 1, userId: 1 }, { unique: true });
occurrenceStatusSchema.index({ userId: 1, occurrenceId: 1 });
occurrenceStatusSchema.index({ userId: 1, setupId: 1, status: 1 });

// Find everything one cause cancelled: removing/editing an event, undoing a mass bunk,
// withdrawing a class cancel
occurrenceStatusSchema.index(
  { userId: 1, causeType: 1, causeId: 1 },
  { partialFilterExpression: { causeId: { $type: 'objectId' } } }
);

const OccurrenceStatus = mongoose.model('OccurrenceStatus', occurrenceStatusSchema);

export default OccurrenceStatus;