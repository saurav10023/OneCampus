import mongoose, { Schema } from 'mongoose';

const sharedAdoptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    publicationId: {
      type: Schema.Types.ObjectId,
      ref: 'SharedPublication',
      required: true,
      index: true,
    },
    // The adopter's independent copy
    localSetupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },
    adoptedVersionNumber: { type: Number, required: true, min: 1 },
    // Set when a newer version exists; applied only after the adopter opts in
    updateAvailableVersionNumber: { type: Number, default: null },
    status: { type: String, enum: ['active', 'unlinked'], default: 'active' },
    adoptedAt: { type: Date, default: Date.now },
    lastUpdateAppliedAt: { type: Date },
    // One rating per adopter, so no separate rating collection is needed
    rating: { type: Number, min: 1, max: 5, default: null },
    ratedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevents duplicate adoption, and therefore double counting
sharedAdoptionSchema.index({ userId: 1, publicationId: 1 }, { unique: true });
sharedAdoptionSchema.index({ localSetupId: 1 }, { unique: true });
sharedAdoptionSchema.index({ publicationId: 1, status: 1 });

const SharedAdoption = mongoose.model('SharedAdoption', sharedAdoptionSchema);

export default SharedAdoption;