import mongoose, { Schema } from 'mongoose';
import { buildScopeKey, SCOPE_FIELDS } from '../../utils/scopeKey.js';
import {
  ACADEMIC_YEAR_REGEX,
  DEFAULT_TARGET_PERCENTAGE,
} from '../../utils/constants.js';

const setupSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // Year by pattern YYYY-YY. Semester, branch and section must come from the college's
    // lists (CollegeAcademicConfig); that check is made in the service once the lists exist.
    academicYear: {
      type: String,
      required: true,
      trim: true,
      match: [ACADEMIC_YEAR_REGEX, 'academicYear must look like 2026-27'],
    },
    semesterLabel: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    // Normalized from the four fields above (Spec §3.3). Never set by hand:
    // it is recomputed in the pre-validate hook below.
    scopeKey: { type: String, default: null },
    // Date-only values are stored as UTC midnight so the calendar date never shifts
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },

    // Overall attendance target. A subject's own targetPercentage overrides it.
    targetPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: DEFAULT_TARGET_PERCENTAGE,
    },

    // Official schedule link (Spec §3.3). Set only by the join service, never by a student request.
    officialScheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'OfficialSchedule',
      default: null,
    },
    joinedOfficialAt: { type: Date, default: null },
    // Lab or elective groups picked at join. New entries in these groups are added on sync.
    officialGroups: { type: [String], default: [] },
    // The schedule's contentRevision this setup last synced to (sync on read)
    lastSyncedContentRevision: { type: Number, default: 0, min: 0 },

    // REMOVE in the sharing cut-over (lifecycle Section 5).
    // Convenience pointers only. SharedAdoption / SharedPublication stay the source of truth
    sourcePublicationId: {
      type: Schema.Types.ObjectId,
      ref: 'SharedPublication',
      default: null,
    },
    sourceVersionNumber: { type: Number, default: null },
    publishedAs: {
      type: Schema.Types.ObjectId,
      ref: 'SharedPublication',
      default: null,
    },
  },
  { timestamps: true }
);

setupSchema.index({ ownerId: 1, status: 1 });
// Used to find the matching official schedule
setupSchema.index({ scopeKey: 1 });
// A student cannot hold two active setups for the same scope (many setups are allowed,
// one per semester). Archived setups are not counted.
setupSchema.index(
  { ownerId: 1, scopeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active', scopeKey: { $type: 'string' } },
  }
);

// Runs on every save, so it also covers partial updates done via document.save()
setupSchema.pre('validate', function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'endDate must be on or after startDate');
  }

  // The join link fields go together
  if (Boolean(this.officialScheduleId) !== Boolean(this.joinedOfficialAt)) {
    this.invalidate(
      'joinedOfficialAt',
      'officialScheduleId and joinedOfficialAt must be set together'
    );
  }

  // Recompute when new, when any scope field changed, or when the key is missing
  // (older documents created before scopeKey existed)
  const scopeChanged =
    this.isNew || !this.scopeKey || SCOPE_FIELDS.some((f) => this.isModified(f));
  if (scopeChanged) {
    this.scopeKey = buildScopeKey(this);
  }
});

const Setup = mongoose.model('Setup', setupSchema);

export default Setup;