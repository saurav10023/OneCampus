import mongoose, { Schema } from 'mongoose';

// Where a subject came from. Only services set this, never a client request.
const SUBJECT_ORIGIN = Object.freeze({
  MANUAL: 'manual',
  OFFICIAL: 'official', // created by the official-schedule join or sync
  SHARED_COPY: 'shared_copy', // created by copying another student's shared setup
});

// Lowercase, single-spaced. "Engineering  Maths " and "engineering maths" become the same key.
const toNameKey = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

const subjectSchema = new Schema(
  {
    setupId: { type: Schema.Types.ObjectId, ref: 'Setup', required: true },
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: [100, 'Subject name can be at most 100 characters'],
    },
    // Filled automatically from `name`. Never send it from the client.
    nameKey: { type: String, required: true },
    // Optional. Blank values become undefined so the partial unique index ignores them.
    code: {
      type: String,
      set: (value) => {
        const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return normalized || undefined;
      },
      match: [
        /^[A-Z0-9][A-Z0-9 ._/-]{0,19}$/,
        'Subject code can have up to 20 letters, numbers, spaces, dots, dashes, slashes or underscores',
      ],
    },
    // Overrides the setup's target for this subject (for example labs). Null uses the setup's.
    targetPercentage: {
      type: Number,
      min: [0, 'Target cannot be below 0'],
      max: [100, 'Target cannot be above 100'],
      default: null,
    },

    // Display
    color: {
      type: String,
      default: null,
      match: [/^#[0-9a-fA-F]{6}$/, 'color must look like #1A2B3C'],
    },
    credits: { type: Number, default: null, min: [0, 'credits cannot be below 0'], max: [30, 'credits cannot be above 30'] },

    // A dropped or finished subject can be archived: hidden from the default list, history kept.
    // The attendance service decides whether archived subjects count (Stage 2, step 4).
    isActive: { type: Boolean, default: true },

    // Official schedule link (v2 §5.1). Set only by the join and sync services.
    origin: { type: String, enum: Object.values(SUBJECT_ORIGIN), default: SUBJECT_ORIGIN.MANUAL },
    // The schedule's subject key. Also set when a manual subject is matched and linked at join.
    officialKey: { type: String, trim: true, default: undefined },
    // The schedule revision this subject last synced to
    officialRevisionSeen: { type: Number, default: 0, min: 0 },
    // True once the student edits the name or code of an official subject: sync stops updating it
    officialDetached: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Runs on save() only. Edit subjects with doc.save(), not findOneAndUpdate, or nameKey goes stale.
subjectSchema.pre('validate', function (next) {
  if (this.isNew || this.isModified('name')) {
    this.nameKey = toNameKey(this.name);
  }
  if (this.origin === SUBJECT_ORIGIN.OFFICIAL && !this.officialKey) {
    this.invalidate('officialKey', 'officialKey is required for an official subject');
  }
});

// One subject per name in a setup. Also serves every "list a setup's subjects" query.
subjectSchema.index({ setupId: 1, nameKey: 1 }, { unique: true });
// One subject per code in a setup (only subjects that have a code)
subjectSchema.index(
  { setupId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
// Makes a repeated sync safe: one student-side subject per official subject
subjectSchema.index(
  { setupId: 1, officialKey: 1 },
  { unique: true, partialFilterExpression: { officialKey: { $type: 'string' } } }
);

subjectSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.nameKey;
    delete ret.__v;
    return ret;
  },
});

const Subject = mongoose.model('Subject', subjectSchema);

export { toNameKey, SUBJECT_ORIGIN };
export default Subject;