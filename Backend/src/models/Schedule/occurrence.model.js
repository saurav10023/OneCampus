import mongoose, { Schema } from 'mongoose';
import { TIME_REGEX, CLASS_TYPE } from '../../utils/constants.js';

const occurrenceSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },
    recurringRuleId: {
      type: Schema.Types.ObjectId,
      ref: 'RecurringRule',
      default: null,
    },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    // UTC midnight
    date: { type: Date, required: true },
    // Snapshots: later rule edits must not rewrite history
    plannedStartTime: { type: String, required: true, match: TIME_REGEX },
    plannedEndTime: { type: String, required: true, match: TIME_REGEX },
    attendanceUnits: { type: Number, required: true, min: 1, default: 1 },
    // Snapshots used by mass bunk matching (date, time, class type, subject, group).
    // Kept here so matching needs no join to the rule, and also works for manual_import classes.
    classType: {
      type: String,
      enum: Object.values(CLASS_TYPE),
      default: CLASS_TYPE.LECTURE,
    },
    // null = the whole section
    group: { type: String, trim: true, default: null },
    sourceType: {
      type: String,
      enum: ['recurring_rule', 'manual_import'],
      required: true,
      default: 'recurring_rule',
    },
    generatedRuleVersion: { type: Number },
  },
  { timestamps: true }
);

// Regeneration can never duplicate a rule-generated class
occurrenceSchema.index(
  { setupId: 1, recurringRuleId: 1, date: 1 },
  { unique: true, partialFilterExpression: { sourceType: 'recurring_rule' } }
);

// Occurrences without a rule need their own duplicate guard
occurrenceSchema.index(
  { setupId: 1, subjectId: 1, date: 1, plannedStartTime: 1 },
  { unique: true, partialFilterExpression: { sourceType: 'manual_import' } }
);

occurrenceSchema.index({ setupId: 1, date: 1 });
occurrenceSchema.index({ subjectId: 1, date: 1 });

const Occurrence = mongoose.model('Occurrence', occurrenceSchema);

export default Occurrence;