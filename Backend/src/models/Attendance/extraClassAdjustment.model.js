import mongoose, { Schema } from 'mongoose';

const extraClassAdjustmentSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    totalCount: { type: Number, required: true, min: 0, default: 0 },
    attendedCount: { type: Number, required: true, min: 0, default: 0 },
    missedCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

// One adjustment record per subject in a setup
extraClassAdjustmentSchema.index({ setupId: 1, subjectId: 1 }, { unique: true });

extraClassAdjustmentSchema.pre('validate', function (next) {
  if (this.attendedCount + this.missedCount > this.totalCount) {
    this.invalidate('totalCount', 'attendedCount + missedCount cannot exceed totalCount');
  }
  next();
});

const ExtraClassAdjustment = mongoose.model(
  'ExtraClassAdjustment',
  extraClassAdjustmentSchema
);

export default ExtraClassAdjustment;