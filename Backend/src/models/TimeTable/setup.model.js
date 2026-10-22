import mongoose, { Schema } from 'mongoose';
import { buildScopeKey, SCOPE_FIELDS } from '../../utils/scopeKey.js';
import {
  ACADEMIC_YEAR_REGEX,
  DEFAULT_TARGET_PERCENTAGE,
  OPT_OUT_KIND,
  DAY_MS,
} from '../../utils/constants.js';

// One official item the student deleted. Sync skips it and never adds it back
// (lifecycle §4.5). `id` is the id of the schedule's own subject, rule or item.
const optOutSchema = new Schema(
  {
    kind: { type: String, enum: Object.values(OPT_OUT_KIND), required: true },
    id: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

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
    // (checked in the pre-validate hook below)
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

    // Official schedule link (lifecycle §3, §5.1). Set only by the join service,
    // never by a student request. Leaving clears all four fields together.
    officialScheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'OfficialSchedule',
      default: null,
    },
    joinedOfficialAt: { type: Date, default: null },
    // Lab or elective groups picked at join. New entries in these groups are added on sync.
    // Trimmed and de-duplicated on every set.
    officialGroups: {
      type: [String],
      default: [],
      set: (groups) => [
        ...new Set((groups ?? []).map((group) => String(group).trim()).filter(Boolean)),
      ],
    },
    // The schedule's contentRevision this setup last synced to (sync on read)
    lastSyncedContentRevision: { type: Number, default: 0, min: 0 },
    // Official items the student deleted. Sync skips these.
    officialOptOuts: { type: [optOutSchema], default: [] },

    // Student-to-student sharing is kept permanently (lifecycle §2).
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
// one per semester). Archived setups are not counted. Copying a shared setup whose scope
// matches one of the student's own hits this index: the copy service must return a clear
// 409 and roll back (lifecycle §9, item 4).
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

  // Class generation steps in whole days from these, so they must be UTC midnight
  for (const field of ['startDate', 'endDate']) {
    const value = this[field];
    if (value && value.getTime() % DAY_MS !== 0) {
      this.invalidate(field, `${field} must be a date at UTC midnight`);
    }
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