import mongoose, { Schema } from 'mongoose';
import {
  TIME_REGEX,
  CLASS_TYPE,
  ITEM_STATUS,
  SCHEDULE_ITEM_KIND as KIND,
  ITEM_KIND_AFFECTS_CLASSES,
  SLOT_KEYS,
  DAY_MS,
} from '../../utils/constants.js';

const timeField = () => ({ type: String, trim: true, match: [TIME_REGEX, 'Time must be HH:mm'], default: null });

// Which kinds may or must carry each field
const MAY_HAVE_TIMES = new Set([KIND.QUIZ, KIND.EVENT, KIND.MASS_BUNK, KIND.CLASS_CANCEL]);
const NEEDS_TIMES = new Set([KIND.QUIZ, KIND.CLASS_CANCEL]);
const NEEDS_SUBJECT = new Set([KIND.QUIZ, KIND.CLASS_CANCEL]);
const MAY_HAVE_SUBJECT = new Set([KIND.QUIZ, KIND.EXAM, KIND.MASS_BUNK, KIND.CLASS_CANCEL]);
const MAY_FILTER_CLASSES = new Set([KIND.MASS_BUNK, KIND.CLASS_CANCEL]);
const SLOTS_FOR = { [KIND.QUIZ]: ['quiz_1', 'quiz_2'], [KIND.EXAM]: ['midsem', 'endsem'] };

const scheduleItemSchema = new Schema(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'OfficialSchedule', required: true },
    kind: { type: String, enum: Object.values(KIND), required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    // Inclusive, UTC midnight
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    // A quiz and a class cancel carry exact times. A mass bunk may use them to match classes.
    startTime: timeField(),
    endTime: timeField(),
    // The schedule subject's key. Required for a quiz and a class cancel.
    subjectKey: { type: String, trim: true, default: null },
    // quiz_1, quiz_2 (quiz) or midsem, endsem (exam)
    slotKey: { type: String, enum: [...SLOT_KEYS, null], default: null },
    // mass bunk and class cancel only: which classes they hit. null = any.
    classType: { type: String, enum: [...Object.values(CLASS_TYPE), null], default: null },
    group: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
      set: (value) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null),
    },
    note: { type: String, trim: true, maxlength: 500 },
    // Derived from `kind` below. The CR never chooses it.
    affectsClasses: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(ITEM_STATUS), default: ITEM_STATUS.ACTIVE },
    revision: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

scheduleItemSchema.pre('validate', function () {
  const kind = this.kind;
  if (!kind) return; // the required check reports it
  this.affectsClasses = ITEM_KIND_AFFECTS_CLASSES[kind] ?? false;

  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'endDate cannot be before startDate');
  }
  for (const field of ['startDate', 'endDate']) {
    const value = this[field];
    if (value && value.getTime() % DAY_MS !== 0) this.invalidate(field, `${field} must be a date at UTC midnight`);
  }

  // Times
  const hasStart = Boolean(this.startTime);
  const hasEnd = Boolean(this.endTime);
  if (hasStart !== hasEnd) this.invalidate('endTime', 'startTime and endTime must be given together');
  if (hasStart && hasEnd) {
    if (!MAY_HAVE_TIMES.has(kind)) this.invalidate('startTime', `A ${kind} cannot have times`);
    if (this.endTime <= this.startTime) this.invalidate('endTime', 'endTime must be later than startTime');
  }
  if (NEEDS_TIMES.has(kind) && !(hasStart && hasEnd)) this.invalidate('startTime', `A ${kind} needs a start and end time`);

  // One date: a quiz, a class cancel, and an event that has times (a mass bunk may span days)
  const oneDate = kind === KIND.QUIZ || kind === KIND.CLASS_CANCEL || (kind === KIND.EVENT && hasStart);
  if (oneDate && this.startDate && this.endDate && this.startDate.getTime() !== this.endDate.getTime()) {
    this.invalidate('endDate', `A ${kind} is on a single date`);
  }

  // Subject
  if (NEEDS_SUBJECT.has(kind) && !this.subjectKey) this.invalidate('subjectKey', `A ${kind} needs a subject`);
  if (this.subjectKey && !MAY_HAVE_SUBJECT.has(kind)) this.invalidate('subjectKey', `A ${kind} cannot have a subject`);

  // Slot
  if (SLOTS_FOR[kind]) {
    if (!this.slotKey) this.invalidate('slotKey', `A ${kind} needs a slot: ${SLOTS_FOR[kind].join(' or ')}`);
    else if (!SLOTS_FOR[kind].includes(this.slotKey)) this.invalidate('slotKey', `A ${kind} slot must be ${SLOTS_FOR[kind].join(' or ')}`);
  } else if (this.slotKey) {
    this.invalidate('slotKey', `A ${kind} cannot have a slot`);
  }

  // Which classes
  if ((this.classType || this.group) && !MAY_FILTER_CLASSES.has(kind)) {
    this.invalidate('classType', `A ${kind} cannot target a class type or group`);
  }
});

scheduleItemSchema.index({ scheduleId: 1, revision: 1 });
scheduleItemSchema.index({ scheduleId: 1, kind: 1, startDate: 1 });
// One quiz or exam per subject and slot. The unique check for an exam that covers every subject
// (no subjectKey) is made by the service, because an index cannot test for "missing".
scheduleItemSchema.index(
  { scheduleId: 1, subjectKey: 1, slotKey: 1 },
  { unique: true, partialFilterExpression: { status: 'active', subjectKey: { $type: 'string' }, slotKey: { $type: 'string' } } }
);

const ScheduleItem = mongoose.model('ScheduleItem', scheduleItemSchema);
export default ScheduleItem;