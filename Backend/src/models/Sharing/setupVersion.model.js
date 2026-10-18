import mongoose, { Schema } from 'mongoose';

const setupVersionSchema = new Schema(
  {
    // Set only for local setup history
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', default: null },
    publicationId: {
      type: Schema.Types.ObjectId,
      ref: 'SharedPublication',
      default: null,
    },
    versionNumber: { type: Number, required: true, min: 1 },
    // Setup metadata, subjects, rules and holidays. Never attendance data
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changeSummary: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

setupVersionSchema.index(
  { publicationId: 1, versionNumber: 1 },
  { unique: true, partialFilterExpression: { publicationId: { $type: 'objectId' } } }
);
setupVersionSchema.index({ setupId: 1 });

// A published version is immutable
const blockMutation = function (next) {
  next(new Error('SetupVersion is immutable'));
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'].forEach((op) =>
  setupVersionSchema.pre(op, blockMutation)
);
setupVersionSchema.pre('save', function (next) {
  if (!this.isNew) return next(new Error('SetupVersion is immutable'));
  next();
});

const SetupVersion = mongoose.model('SetupVersion', setupVersionSchema);

export default SetupVersion;