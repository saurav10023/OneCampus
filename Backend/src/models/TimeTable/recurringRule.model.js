import mongoose, { Schema } from 'mongoose';
import { TIME_REGEX, CLASS_TYPE } from '../../utils/constants.js';

const timeField = {
  type: String,
  required: true,
  match: [TIME_REGEX, 'Time must be in HH:mm (24-hour) format'],
};

const recurringRuleSchema = new Schema(
  {
    setupId: {
      type: Schema.Types.ObjectId,
      ref: 'Setup',
      required: true,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    // 0 = Sunday ... 6 = Saturday, same as Date#getUTCDay
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startTime: timeField,
    endTime: timeField,
    effectiveStartDate: { type: Date, required: true },
    effectiveEndDate: { type: Date, required: true },
    professor: { type: String, trim: true },
    room: { type: String, trim: true },
    // Defaults to 'lecture' so type filters (mass bunk, Phase D) match untyped new rules.
    // Rules saved before this default existed stay untyped until edited.
    classType: {
      type: String,
      enum: Object.values(CLASS_TYPE),
      default: CLASS_TYPE.LECTURE,
    },
    // Double periods count as more than one class
    attendanceUnits: { type: Number, required: true, min: 1, default: 1 },
    isActive: { type: Boolean, default: true },
    // Bumped on edits so occurrences can record which revision created them
    ruleVersion: { type: Number, default: 1, min: 1 },
  },
  { timestamps: true }
);

recurringRuleSchema.index({ setupId: 1, weekday: 1, isActive: 1 });

recurringRuleSchema.pre('validate', function (next) {
  // Zero-padded HH:mm strings compare correctly as text
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'endTime must be later than startTime');
  }
  if (
    this.effectiveStartDate &&
    this.effectiveEndDate &&
    this.effectiveEndDate < this.effectiveStartDate
  ) {
    this.invalidate('effectiveEndDate', 'effectiveEndDate must not precede effectiveStartDate');
  }
  next();
});

const RecurringRule = mongoose.model('RecurringRule', recurringRuleSchema);

export default RecurringRule;