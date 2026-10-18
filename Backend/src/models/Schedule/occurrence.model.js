import mongoose, { Schema } from 'mongoose';
import { TIME_REGEX } from '../../utils/constants.js';

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
    sourceType: {
      type: String,
      enum: ['recurring_rule', 'manual_import'],
      required: true,
      default: 'recurring_rule',
    },
    generatedRuleVersion: { type: Number }
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