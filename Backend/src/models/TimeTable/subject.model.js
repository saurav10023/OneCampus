import mongoose, { Schema } from 'mongoose';

const subjectSchema = new Schema(
  {
    setupId: {
      type: Schema.Types.ObjectId,
      ref: 'Setup',
      required: true,
      index: true,
    },
    // Overrides the setup's target for this subject (e.g. labs). Null means use the setup's
    targetPercentage: { type: Number, min: 0, max: 100, default: null },
    name: { type: String, required: true, trim: true },
    // Optional; blank values become undefined so the partial unique index ignores them
    code: {
      type: String,
      set: (value) => {
        const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return normalized || undefined;
      },
    },
  },
  { timestamps: true }
);

subjectSchema.index(
  { setupId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

const Subject = mongoose.model('Subject', subjectSchema);

export default Subject;