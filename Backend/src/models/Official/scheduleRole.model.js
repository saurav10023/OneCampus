import mongoose, { Schema } from 'mongoose';
import { normalizeScopePart } from '../../utils/scopeKey.js';
import { BRANCHES, SECTIONS, SCHEDULE_ROLE, SCHEDULE_ROLE_STATUS } from '../../utils/constants.js';

const scheduleRoleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    college: { type: String, required: true, trim: true },
    collegeKey: { type: String, required: true },
    role: { type: String, enum: Object.values(SCHEDULE_ROLE), required: true },
    // A CR covers one branch and section (all semesters). An admin covers the college: both null.
    branch: { type: String, trim: true, enum: { values: [...BRANCHES, null], message: '{VALUE} is not a valid branch' }, default: null },
    section: { type: String, trim: true, enum: { values: [...SECTIONS, null], message: '{VALUE} is not a valid section' }, default: null },
    status: { type: String, enum: Object.values(SCHEDULE_ROLE_STATUS), default: SCHEDULE_ROLE_STATUS.PENDING },
    // true while pending or active. Lets the unique index ignore revoked and rejected rows.
    isOpen: { type: Boolean, default: true },

    requestedAt: { type: Date, default: Date.now },
    requestNote: { type: String, trim: true, maxlength: 300, default: '' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true }
);

scheduleRoleSchema.pre('validate', function () {
  this.collegeKey = normalizeScopePart(this.college);
  this.isOpen = [SCHEDULE_ROLE_STATUS.PENDING, SCHEDULE_ROLE_STATUS.ACTIVE].includes(this.status);

  if (this.role === SCHEDULE_ROLE.CR && (!this.branch || !this.section)) {
    this.invalidate('branch', 'A CR role needs a branch and a section');
  }
  if (this.role === SCHEDULE_ROLE.ADMIN && (this.branch || this.section)) {
    this.invalidate('branch', 'An admin role covers the whole college, so it has no branch or section');
  }
  if (this.status !== SCHEDULE_ROLE_STATUS.PENDING && !this.decidedAt && this.isModified('status') && !this.isNew) {
    this.decidedAt = new Date();
  }
});

// A user holds one open role per college and class
scheduleRoleSchema.index(
  { userId: 1, collegeKey: 1, role: 1, branch: 1, section: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } }
);
// Counting the CRs of a class, listing pending requests, and loading one user's roles
scheduleRoleSchema.index({ collegeKey: 1, role: 1, branch: 1, section: 1, status: 1 });
scheduleRoleSchema.index({ userId: 1, status: 1 });

const ScheduleRole = mongoose.model('ScheduleRole', scheduleRoleSchema);
export default ScheduleRole;