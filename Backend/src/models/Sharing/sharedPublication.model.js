import mongoose, { Schema } from 'mongoose';

const sharedPublicationSchema = new Schema(
  {
    publisherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Nulled if the publisher deletes their setup; the published snapshot is unaffected
    sourceSetupId: { type: Schema.Types.ObjectId, ref: 'Setup', default: null },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },

    // Search fields, copied from the snapshot so listing never has to read it
    collegeId: { type: String, required: true, trim: true },
    branch: { type: String, trim: true },
    semesterLabel: { type: String, trim: true },
    academicYear: { type: String, trim: true },
    section: { type: String, trim: true },
    subjectCount: { type: Number, default: 0 },
    subjectNames: { type: [String], default: [] },

    // Structure only, never attendance. Hidden from list queries to keep them light
    snapshot: { type: Schema.Types.Mixed, required: true, select: false },
    status: {
      type: String,
      enum: ['published', 'unpublished', 'removed'],
      default: 'published',
    },

    // Usage: unique users who currently hold a copy, never views
    usedByCount: { type: Number, default: 0, min: 0 },
    activeUserCount: { type: Number, default: 0, min: 0 }, // set by the reconcile job
    lastCopiedAt: { type: Date },

    // Ratings: average is derived but stored so listings can sort on it
    ratingSum: { type: Number, default: 0, min: 0 },
    ratingCount: { type: Number, default: 0, min: 0 },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },

    // Trust and ranking
    openReportCount: { type: Number, default: 0, min: 0 },
    isVerified: { type: Boolean, default: false }, // moderators only, never via user input
    rankScore: { type: Number, default: 0 }, // precomputed by a job

    publishedAt: { type: Date },
    snapshotUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

// Main discovery query
sharedPublicationSchema.index({
  status: 1,
  collegeId: 1,
  branch: 1,
  semesterLabel: 1,
  rankScore: -1,
});
sharedPublicationSchema.index({ title: 'text', subjectNames: 'text' });
sharedPublicationSchema.index({ publisherId: 1, createdAt: -1 });
sharedPublicationSchema.index({ sourceSetupId: 1 });

// One live publication per setup; refreshing replaces its snapshot
sharedPublicationSchema.index(
  { publisherId: 1, sourceSetupId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceSetupId: { $type: 'objectId' },
      status: 'published',
    },
  }
);

const SharedPublication = mongoose.model('SharedPublication', sharedPublicationSchema);

export default SharedPublication;