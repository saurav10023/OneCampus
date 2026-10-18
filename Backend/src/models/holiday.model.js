import mongoose, { Schema } from 'mongoose';

const holidaySchema = new Schema(
  {
    setupId: {
      type: Schema.Types.ObjectId,
      ref: 'Setup',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    source: {
      type: String,
      enum: ['manual', 'pdf_import', 'shared_setup'],
      default: 'manual',
    },
    // Null until the student reviews it; only confirmed holidays cancel classes
    confirmedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

holidaySchema.index({ setupId: 1, startDate: 1, endDate: 1 });

holidaySchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'endDate must be on or after startDate');
  }
  next();
});

const Holiday = mongoose.model('Holiday', holidaySchema);

export default Holiday;