import mongoose, { Schema } from 'mongoose';
import { buildScopeKey, normalizeScopePart, SCOPE_FIELDS } from '../../utils/scopeKey.js';
import { parseSemester } from '../../utils/semester.js';
import {
  ACADEMIC_YEAR_REGEX,
  BRANCHES,
  SECTIONS,
  SCHEDULE_STATUS,
  GROUP_KIND,
  MAX_SCHEDULE_GROUPS,
  DAY_MS,
} from '../../utils/constants.js';

// A lab batch or elective group. A class or mass bunk may carry a group key, or none (the whole
// section). A student picks groups when joining.
const groupSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_-]{1,20}$/, 'A group key can have up to 20 letters, numbers, dashes or underscores'],
    },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: Object.values(GROUP_KIND), default: GROUP_KIND.LAB },
  },
  { _id: false }
);

const officialScheduleSchema = new Schema(
  {
    // The college exactly as the User model stores it, and its normalized form for matching
    college: { type: String, required: true, trim: true },
    collegeKey: { type: String, required: true },

    academicYear: {
      type: String,
      required: true,
      trim: true,
      match: [ACADEMIC_YEAR_REGEX, 'academicYear must look like 2026-27'],
    },
    semesterLabel: { type: String, required: true, trim: true, maxlength: 40 },
    // Read from semesterLabel ("Sem 5" and "5th" are both 5). Used to find a student's schedules.
    semesterNumber: { type: Number, default: null },
    // TEMPORARY: the same lists the User model uses, until CollegeAcademicConfig exists
    branch: { type: String, required: true, trim: true, enum: { values: BRANCHES, message: '{VALUE} is not a valid branch' } },
    section: { type: String, required: true, trim: true, enum: { values: SECTIONS, message: '{VALUE} is not a valid section' } },
    // Same builder as Setup.scopeKey. Never set by hand.
    scopeKey: { type: String, required: true },

    // Optional official semester dates. At join they are offered as the setup's dates.
    semesterStart: { type: Date, default: null },
    semesterEnd: { type: Date, default: null },

    status: { type: String, enum: Object.values(SCHEDULE_STATUS), default: SCHEDULE_STATUS.DRAFT },
    // true for draft and published. Lets the unique indexes ignore archived schedules.
    isLive: { type: Boolean, default: true },

    // Goes up by one for every change. Each subject, rule and item stores the value it was written
    // at, so a student's sync asks for "everything after the revision I last saw".
    contentRevision: { type: Number, default: 0, min: 0 },

    groups: { type: [groupSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One live schedule per class, however the semester is written
officialScheduleSchema.index({ collegeKey: 1, scopeKey: 1 }, { unique: true, partialFilterExpression: { isLive: true } });
officialScheduleSchema.index(
  { collegeKey: 1, academicYear: 1, semesterNumber: 1, branch: 1, section: 1 },
  { unique: true, partialFilterExpression: { isLive: true, semesterNumber: { $type: 'number' } } }
);
// Finding the schedules a student can join
officialScheduleSchema.index({ collegeKey: 1, academicYear: 1, status: 1 });

officialScheduleSchema.pre('validate', function () {
  this.collegeKey = normalizeScopePart(this.college);
  this.semesterNumber = parseSemester(this.semesterLabel);
  this.scopeKey = buildScopeKey(this);
  this.isLive = this.status !== SCHEDULE_STATUS.ARCHIVED;
  if (this.status === SCHEDULE_STATUS.PUBLISHED && !this.publishedAt) this.publishedAt = new Date();

  // Students are linked by scope, so it cannot move once the schedule has been published
  if (!this.isNew && this.publishedAt && ['college', ...SCOPE_FIELDS].some((f) => this.isModified(f))) {
    this.invalidate('scopeKey', 'A published schedule cannot change its college, year, semester, branch or section');
  }

  const keys = (this.groups ?? []).map((g) => g.key);
  if (new Set(keys).size !== keys.length) this.invalidate('groups', 'Group keys must be unique');
  if (keys.length > MAX_SCHEDULE_GROUPS) this.invalidate('groups', `A schedule can have at most ${MAX_SCHEDULE_GROUPS} groups`);

  if (Boolean(this.semesterStart) !== Boolean(this.semesterEnd)) {
    this.invalidate('semesterEnd', 'semesterStart and semesterEnd must be given together');
  }
  if (this.semesterStart && this.semesterEnd && this.semesterEnd < this.semesterStart) {
    this.invalidate('semesterEnd', 'semesterEnd must be on or after semesterStart');
  }
  for (const field of ['semesterStart', 'semesterEnd']) {
    const value = this[field];
    if (value && value.getTime() % DAY_MS !== 0) this.invalidate(field, `${field} must be a date at UTC midnight`);
  }
});

const OfficialSchedule = mongoose.model('OfficialSchedule', officialScheduleSchema);
export default OfficialSchedule;