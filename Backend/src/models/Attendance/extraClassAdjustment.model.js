import mongoose, { Schema } from 'mongoose';

const extraClassAdjustmentSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    totalCount: { type: Number, required: true, min: 0, default: 0 },
    attendedCount: { type: Number, required: true, min: 0, default: 0 },
    missedCount: { type: Number, required: true, min: 0, default: 0 },
        // Optional reminder of why these exist, for example "makeup for the 12 Oct lab"
    note: { type: String, trim: true, maxlength: [300, 'note can be at most 300 characters'], default: undefined },
        // Subjects already folded into this record by a merge. Makes a retried merge safe.
    mergedSources: { type: [Schema.Types.ObjectId], default: undefined, select: false },
  },
  { timestamps: true }
);

// One adjustment record per subject in a setup
extraClassAdjustmentSchema.index({ setupId: 1, subjectId: 1 }, { unique: true });

extraClassAdjustmentSchema.pre('validate', function (next) {
  if (this.attendedCount + this.missedCount > this.totalCount) {
    this.invalidate('totalCount', 'attendedCount + missedCount cannot exceed totalCount');
  }
});

const ExtraClassAdjustment = mongoose.model(
  'ExtraClassAdjustment',
  extraClassAdjustmentSchema
);

export default ExtraClassAdjustment;