import mongoose, { Schema } from 'mongoose';

// Records that a user took a one-time copy. The copy itself is an ordinary,
// independent Setup: nothing here links it back for updates
const setupCopySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    publicationId: {
      type: Schema.Types.ObjectId,
      ref: 'SharedPublication',
      required: true,
      index: true,
    },
    localSetupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },
    // One rating per user, so no separate rating collection is needed
    rating: { type: Number, min: 1, max: 5, default: null },
    ratedAt: { type: Date },
    copiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevents counting the same user twice
setupCopySchema.index({ userId: 1, publicationId: 1 }, { unique: true });
setupCopySchema.index({ localSetupId: 1 }, { unique: true });

const SetupCopy = mongoose.model('SetupCopy', setupCopySchema);

export default SetupCopy;