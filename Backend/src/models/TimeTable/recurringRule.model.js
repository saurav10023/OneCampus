import mongoose, { Schema } from 'mongoose';
import { TIME_REGEX, CLASS_TYPE, ORIGIN, DAY_MS } from '../../utils/constants.js';

const timeField = {
  type: String,
  required: true,
  match: [TIME_REGEX, 'Time must be in HH:mm (24-hour) format'],
};

// Changing any of these changes the classes the rule generates, so ruleVersion is bumped.
// professor and room are not here: occurrences do not snapshot them.
const GENERATION_FIELDS = [
  'subjectId',
  'weekday',
  'startTime',
  'endTime',
  'attendanceUnits',
  'effectiveStartDate',
  'effectiveEndDate',
  'classType',
  'group',
];

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
    // 0 = Sunday ... 6 = Saturday, same as Date#getUTCDay. Whole numbers only: a value like 1.5
    // would make generateOccurrences step to dates that are not real weekdays.
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
      validate: {
        validator: Number.isInteger,
        message: 'weekday must be a whole number from 0 (Sunday) to 6 (Saturday)',
      },
    },
    startTime: timeField,
    endTime: timeField,
    // UTC midnight (checked below): generateOccurrences steps in whole days from these
    effectiveStartDate: { type: Date, required: true },
    effectiveEndDate: { type: Date, required: true },
    professor: { type: String, trim: true },
    room: { type: String, trim: true },
    // Defaults to 'lecture' so type filters (mass bunk) match untyped new rules.
    // Rules saved before this default existed stay untyped until edited.
    classType: {
      type: String,
      enum: Object.values(CLASS_TYPE),
      default: CLASS_TYPE.LECTURE,
    },
    // Lab batch or elective group. null = the whole section. Used by mass bunk matching.
    // A blank or whitespace-only value is stored as null, never as "", so "whole section" always
    // means the same thing when groups are compared.
    group: {
      type: String,
      trim: true,
      maxlength: [40, 'group can be at most 40 characters'],
      default: null,
      set: (value) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null),
    },
    
    // Double periods count as more than one class
    attendanceUnits: { type: Number, required: true, min: 1, default: 1 },
    isActive: { type: Boolean, default: true },
    // Bumped automatically on save when a generation field changes (see the save hook)
    ruleVersion: { type: Number, default: 1, min: 1 },

    // Official link (lifecycle §5.1). Set only by the join and sync services.
    origin: {
      type: String,
      enum: Object.values(ORIGIN),
      default: ORIGIN.MANUAL,
    },
    // The ScheduleRule this class came from. Kept even after the student detaches it,
    // so the unique index below stops sync from adding it a second time.
    officialRuleId: {
      type: Schema.Types.ObjectId,
      ref: 'ScheduleRule',
      default: null,
    },
    // The schedule rule's revision this class last matched
    officialRevisionSeen: { type: Number, default: null, min: 0 },
    // true once the student edits or dismisses an official change: sync stops proposing
    // changes for this class (lifecycle §4.5, §6.4)
    detachedFromOfficial: { type: Boolean, default: false },
  },
  { timestamps: true }
);

recurringRuleSchema.index({ setupId: 1, weekday: 1, isActive: 1 });
// A repeated sync or join can never create the same official class twice
recurringRuleSchema.index(
  { setupId: 1, officialRuleId: 1 },
  { unique: true, partialFilterExpression: { officialRuleId: { $type: 'objectId' } } }
);

recurringRuleSchema.pre('validate', function () {
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

  for (const field of ['effectiveStartDate', 'effectiveEndDate']) {
    const value = this[field];
    if (value && value.getTime() % DAY_MS !== 0) {
      this.invalidate(field, `${field} must be a date at UTC midnight`);
    }
  }

  // Official link fields go together and belong only to official rules
  const isOfficial = this.origin === ORIGIN.OFFICIAL;
  if (isOfficial && !this.officialRuleId) {
    this.invalidate('officialRuleId', 'An official rule needs officialRuleId');
  }
  if (!isOfficial && (this.officialRuleId || this.detachedFromOfficial)) {
    this.invalidate('origin', 'officialRuleId and detachedFromOfficial are only for official rules');
  }
});

// Runs on document.save(), so edits must go through save(), not findOneAndUpdate.
// A caller that sets ruleVersion itself is left alone.
recurringRuleSchema.pre('save', function () {
  if (this.isNew || this.isModified('ruleVersion')) return;
  if (GENERATION_FIELDS.some((field) => this.isModified(field))) {
    this.ruleVersion += 1;
  }
});

const RecurringRule = mongoose.model('RecurringRule', recurringRuleSchema);

export default RecurringRule;