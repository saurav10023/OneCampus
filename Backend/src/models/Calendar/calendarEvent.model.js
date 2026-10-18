import mongoose, { Schema } from 'mongoose';
import {
  EVENT_TYPE,
  EVENT_SOURCE,
  OFFICIAL_REF_KIND,
  EVENT_AFFECTS_CLASSES_DEFAULT,
  TIMED_EVENT_TYPES,
  TIME_REGEX,
} from '../../utils/constants.js';

// HH:mm, 24 hour (pattern lives in constants.js)
const timeField = () => ({
  type: String,
  trim: true,
  match: [TIME_REGEX, 'Time must be HH:mm'],
});

// Filled only by the image import, so the student can compare each draft with what was read
const extractionSchema = new Schema(
  {
    confidence: { type: Number, min: 0, max: 1 },
    rawText: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

// Which official item (schedule slot or calendar item) this event came from
const officialRefSchema = new Schema(
  {
    kind: { type: String, enum: Object.values(OFFICIAL_REF_KIND), required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

// What the last automatic update changed, so the UI can show "Updated automatically"
const rangeSnapshotSchema = new Schema(
  { startDate: Date, endDate: Date, startTime: String, endTime: String },
  { _id: false }
);
const lastAutoUpdateSchema = new Schema(
  {
    from: rangeSnapshotSchema,
    to: rangeSnapshotSchema,
    at: { type: Date, required: true },
  },
  { _id: false }
);

const calendarEventSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    type: {
      type: String,
      enum: Object.values(EVENT_TYPE),
      required: true,
      default: EVENT_TYPE.HOLIDAY,
    },
    // Inclusive. Stored as UTC midnight.
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // Only for quiz and event types. Never on an event that cancels classes.
    startTime: timeField(),
    endTime: timeField(),
    // Manual and imported events: defaults from EVENT_AFFECTS_CLASSES_DEFAULT.
    // Official events: set by the sync service from the official item, never by the student.
    affectsClasses: {
      type: Boolean,
      required: true,
      default: function () {
        return EVENT_AFFECTS_CLASSES_DEFAULT[this.type] ?? false;
      },
    },
    note: { type: String, trim: true, maxlength: 500 },
    source: {
      type: String,
      enum: Object.values(EVENT_SOURCE),
      default: EVENT_SOURCE.MANUAL,
    },
    importJobId: { type: Schema.Types.ObjectId, ref: 'ImportJob', default: null },
    extraction: { type: extractionSchema, default: undefined },
    // Null means a draft: visible for review, cancels nothing.
    // Official events are always created confirmed by the sync service.
    confirmedAt: { type: Date, default: null },

    // Official link and auto-follow. Set only on events created by the sync (source 'official').
    // Students cannot edit or delete these (the controller returns 403).
    officialRef: { type: officialRefSchema, default: undefined },
    followOfficial: { type: Boolean, default: false },
    officialRevisionSeen: { type: Number, default: null },
    officialWithdrawn: { type: Boolean, default: false },
    lastAutoUpdate: { type: lastAutoUpdateSchema, default: undefined },
  },
  { timestamps: true }
);

calendarEventSchema.pre('validate', function (next) {
  // Dates
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'endDate cannot be before startDate');
  }

  // A quiz never cancels classes
  if (this.type === EVENT_TYPE.QUIZ && this.affectsClasses) {
    this.invalidate('affectsClasses', 'A quiz cannot cancel classes');
  }

  // Times: both or neither, quiz/event only, never on a cancelling event
  const hasStart = Boolean(this.startTime);
  const hasEnd = Boolean(this.endTime);
  if (hasStart !== hasEnd) {
    this.invalidate('endTime', 'startTime and endTime must be given together');
  }
  if (hasStart && hasEnd) {
    if (!TIMED_EVENT_TYPES.includes(this.type)) {
      this.invalidate('startTime', 'Times are only allowed on quiz and event types');
    }
    if (this.affectsClasses) {
      this.invalidate('startTime', 'An event that cancels classes cannot have times');
    }
    if (this.endTime <= this.startTime) {
      this.invalidate('endTime', 'endTime must be later than startTime');
    }
    if (
      this.startDate &&
      this.endDate &&
      this.startDate.getTime() !== this.endDate.getTime()
    ) {
      this.invalidate('endDate', 'A timed event must be on a single date');
    }
  }

  // The official link must be consistent
  const isOfficial = this.source === EVENT_SOURCE.OFFICIAL;
  if (isOfficial && !this.officialRef) {
    this.invalidate('officialRef', 'An official event needs officialRef');
  }
  if (!isOfficial && this.officialRef) {
    this.invalidate('source', 'officialRef is only allowed when source is official');
  }
  if (this.followOfficial && !this.officialRef) {
    this.invalidate('followOfficial', 'followOfficial needs officialRef');
  }
  // Official events are never drafts
  if (isOfficial && !this.confirmedAt) {
    this.invalidate('confirmedAt', 'An official event must be confirmed');
  }

  next();
});

// Range queries: list by date window, find events covering a day
calendarEventSchema.index({ setupId: 1, startDate: 1, endDate: 1 });

// Sync: find every event that follows one official item
calendarEventSchema.index(
  { 'officialRef.id': 1, followOfficial: 1 },
  { partialFilterExpression: { 'officialRef.id': { $type: 'objectId' } } }
);

// One event per official item per setup. This is what makes the sync safe to retry:
// a second create for the same item is rejected.
calendarEventSchema.index(
  { setupId: 1, 'officialRef.id': 1 },
  { unique: true, partialFilterExpression: { 'officialRef.id': { $type: 'objectId' } } }
);

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;