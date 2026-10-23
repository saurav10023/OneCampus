import mongoose, { Schema } from 'mongoose';
import { TIME_REGEX, CLASS_TYPE, ENTRY_TYPE, ITEM_STATUS, DAY_MS } from '../../utils/constants.js';

const timeField = {
  type: String,
  required: true,
  match: [TIME_REGEX, 'Time must be in HH:mm (24-hour) format'],
};

const scheduleRuleSchema = new Schema(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OfficialSchedule', required: true },
    subjectKey: { type: String, required: true, trim: true },
    // weekly: repeats every week. makeup: one date (effective start and end are equal).
    entryType: { type: String, enum: Object.values(ENTRY_TYPE), default: ENTRY_TYPE.WEEKLY },
    // 0 = Sunday ... 6 = Saturday. For a makeup it is read from the date.
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      validate: { validator: Number.isInteger, message: 'weekday must be a whole number from 0 (Sunday) to 6 (Saturday)' },
    },
    startTime: timeField,
    endTime: timeField,
    classType: { type: String, enum: Object.values(CLASS_TYPE), default: CLASS_TYPE.LECTURE },
    // A group key from the schedule's groups, or null for the whole section
    group: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
      set: (value) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null),
    },
    room: { type: String, trim: true },
    professor: { type: String, trim: true },
    attendanceUnits: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
      default: 1,
      validate: { validator: Number.isInteger, message: 'attendanceUnits must be a whole number' },
    },
    // null on a weekly class means "the student's whole setup range"
    effectiveStartDate: { type: Date, default: null },
    effectiveEndDate: { type: Date, default: null },
    status: { type: String, enum: Object.values(ITEM_STATUS), default: ITEM_STATUS.ACTIVE },
    revision: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

scheduleRuleSchema.pre('validate', function () {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be later than startTime');
  }

  const hasStart = Boolean(this.effectiveStartDate);
  const hasEnd = Boolean(this.effectiveEndDate);
  if (hasStart !== hasEnd) this.invalidate('effectiveEndDate', 'effectiveStartDate and effectiveEndDate must be given together');
  if (hasStart && hasEnd) {
    if (this.effectiveEndDate < this.effectiveStartDate) {
      this.invalidate('effectiveEndDate', 'effectiveEndDate must not precede effectiveStartDate');
    }
    for (const field of ['effectiveStartDate', 'effectiveEndDate']) {
      if (this[field].getTime() % DAY_MS !== 0) this.invalidate(field, `${field} must be a date at UTC midnight`);
    }
  }

  if (this.entryType === ENTRY_TYPE.MAKEUP) {
    if (!hasStart || !hasEnd) {
      this.invalidate('effectiveStartDate', 'A makeup class needs its date');
    } else if (this.effectiveStartDate.getTime() !== this.effectiveEndDate.getTime()) {
      this.invalidate('effectiveEndDate', 'A makeup class is on a single date');
    } else {
      this.weekday = this.effectiveStartDate.getUTCDay();
    }
  }
});

scheduleRuleSchema.index({ scheduleId: 1, revision: 1 });
scheduleRuleSchema.index({ scheduleId: 1, status: 1, weekday: 1 });

const ScheduleRule = mongoose.model('ScheduleRule', scheduleRuleSchema);
export default ScheduleRule;