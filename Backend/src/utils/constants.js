// src/utils/constants.js
// Single source of truth for shared constants. Spec revision 4.
// Models import it as '../../utils/constants.js' (from models/<Folder>/),
// services as '../utils/constants.js'. Keep this file at one path and make every import match.
//
// Style: UPPER_SNAKE keys, lowercase values, Object.freeze on every object.

/* ------------------------------------------------------------------ */
/* Users, college, session                                            */
/* ------------------------------------------------------------------ */

// Account-level role on User. The per-class permission is SCHEDULE_ROLE below.
export const USER_ROLES = ["student", "cr", "moderator", "admin"];

export const DEFAULT_COLLEGE = "BIT Mesra, Ranchi";

// TEMPORARY. Branch and section lists now live in CollegeAcademicConfig (Spec §4.1),
// created by scripts/seedCollege.js. Keep these only until Section 3 of the lifecycle is done,
// then delete them and remove every import of them.
export const BRANCHES = ["CSE", "IT", "ECE", "EEE", "ME", "CE"];
export const SECTIONS = ["A", "B", "C", "D"];

// Soft-deleted accounts can be restored by logging in within this many days.
export const ACCOUNT_DELETION_GRACE_DAYS = 10;

// Login cookie and JWT both last this long (single token, no refresh token).
export const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

// Setup.targetPercentage default. A subject's own targetPercentage overrides it.
export const DEFAULT_TARGET_PERCENTAGE = 75;

// academicYear format, for example 2026-27
export const ACADEMIC_YEAR_REGEX = /^\d{4}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* Official link (Lifecycle §5.1)                                     */
/* ------------------------------------------------------------------ */

// Where a Subject or RecurringRule came from. officialRuleId / officialKey are set only
// when origin is 'official'. 'shared_copy' marks content copied from a shared setup.
export const ORIGIN = Object.freeze({
  MANUAL: 'manual',
  OFFICIAL: 'official',
  SHARED_COPY: 'shared_copy',
});

// Setup.officialOptOuts[].kind: what kind of official item the student hid
export const OPT_OUT_KIND = Object.freeze({
  SUBJECT: 'subject',
  RULE: 'rule',
  ITEM: 'item',
});

/* ------------------------------------------------------------------ */
/* Calendar events (student's CalendarEvent)                          */
/* ------------------------------------------------------------------ */

export const EVENT_TYPE = Object.freeze({
  HOLIDAY: 'holiday',
  BREAK: 'break',
  EXAM: 'exam',
  QUIZ: 'quiz',
  LAST_WORKING_DAY: 'last_working_day',
  EVENT: 'event',
});

// Used for events a student adds by hand or confirms from an image import.
// Quiz is always false. Official events never use this table: the sync service sets
// affectsClasses from the official item (holiday, break and exam true; quiz and the rest false).
export const EVENT_AFFECTS_CLASSES_DEFAULT = Object.freeze({
  holiday: true,
  break: true,
  exam: false,
  quiz: false,
  last_working_day: false,
  event: false,
});

// Types that may carry startTime / endTime
export const TIMED_EVENT_TYPES = Object.freeze([EVENT_TYPE.QUIZ, EVENT_TYPE.EVENT]);

export const EVENT_SOURCE = Object.freeze({
  MANUAL: 'manual',
  IMAGE_IMPORT: 'image_import',
  SHARED_SETUP: 'shared_setup', // events copied from a shared setup (sharing stays)
  OFFICIAL: 'official',
});

// CalendarEvent.officialRef.kind: which kind of official item the event came from.
// A mass bunk is its own MassBunk record, not an event, so it is deliberately not here.
// SLOT and CALENDAR_ITEM stay until calendarEvent.model.js moves to the single ITEM kind
// (Lifecycle v2: one ScheduleItem for holiday, quiz, exam and mass bunk).
export const OFFICIAL_REF_KIND = Object.freeze({
  SLOT: 'slot',
  CALENDAR_ITEM: 'calendar_item',
  ITEM: 'item',
});

/* ------------------------------------------------------------------ */
/* Attendance statuses                                                */
/* ------------------------------------------------------------------ */

const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  // Excluded from the percentage, like cancelled, but caused by a date-range change
  NOT_COUNTED: 'not_counted',
  // Student-set leave (medical or duty). Excluded from the denominator but kept separate
  // from cancelled because the class was held. It has no cause and counts as a user mark,
  // so the sync keeps it.
  EXCUSED: 'excused',
});

const STATUS_REASON = Object.freeze({
  START_DATE_CHANGE: 'start_date_change',
  END_DATE_CHANGE: 'end_date_change',
});

// OccurrenceStatus.source: who set the status.
// A cancelled status's source must match its causeType (see CAUSE_TYPE_TO_SOURCE).
export const STATUS_SOURCE = Object.freeze({
  USER: 'user',
  SYSTEM: 'system',
  HOLIDAY: 'holiday',
  MASS_BUNK: 'mass_bunk',
  CLASS_CANCEL: 'class_cancel',
});

// OccurrenceStatus.causeType: who or what holds a class in `cancelled`
export const CAUSE_TYPE = Object.freeze({
  CALENDAR_EVENT: 'calendar_event',
  MASS_BUNK: 'mass_bunk',
  CLASS_CANCEL: 'class_cancel', // a CR cancelling one class (Spec §4.6)
});

// Used by the OccurrenceStatus validation hook and the cancellation service
export const CAUSE_TYPE_TO_SOURCE = Object.freeze({
  [CAUSE_TYPE.CALENDAR_EVENT]: STATUS_SOURCE.HOLIDAY,
  [CAUSE_TYPE.MASS_BUNK]: STATUS_SOURCE.MASS_BUNK,
  [CAUSE_TYPE.CLASS_CANCEL]: STATUS_SOURCE.CLASS_CANCEL,
});

/* ------------------------------------------------------------------ */
/* Classes (shared by recurring rules and mass bunk matching)         */
/* ------------------------------------------------------------------ */

export const CLASS_TYPE = Object.freeze({
  LECTURE: 'lecture',
  LAB: 'lab',
  TUTORIAL: 'tutorial',
  SEMINAR: 'seminar',
  OTHER: 'other',
});

/* ------------------------------------------------------------------ */
/* Official schedule: timetable entries (Spec §4.3)                   */
/* ------------------------------------------------------------------ */

export const ENTRY_TYPE = Object.freeze({
  WEEKLY: 'weekly',
  MAKEUP: 'makeup', // one date: effectiveStartDate equals effectiveEndDate
});

/* ------------------------------------------------------------------ */
/* Official schedule: slots, quizzes and exams (Spec §4.4)            */
/* ------------------------------------------------------------------ */

// timed = a quiz: one date plus times, cancels nothing.
// whole_day = an exam (mid-sem, end-sem): a date range, cancels classes.
export const SLOT_KIND = Object.freeze({
  TIMED: 'timed',
  WHOLE_DAY: 'whole_day',
});

// Copied into every new OfficialSchedule as its slotDefs. Admins and CRs can change a schedule's own list.
export const DEFAULT_SLOT_DEFS = Object.freeze([
  Object.freeze({ key: 'quiz_1', label: 'Quiz 1', kind: SLOT_KIND.TIMED }),
  Object.freeze({ key: 'quiz_2', label: 'Quiz 2', kind: SLOT_KIND.TIMED }),
  Object.freeze({ key: 'midsem', label: 'Mid-sem', kind: SLOT_KIND.WHOLE_DAY }),
  Object.freeze({ key: 'endsem', label: 'End-sem', kind: SLOT_KIND.WHOLE_DAY }),
]);

// Keeps a schedule's slot list small and the UI grid readable
export const MAX_SLOT_DEFS = 10;
export const MAX_SCHEDULE_SUBJECTS = 20;

/* ------------------------------------------------------------------ */
/* Official schedule: calendar items (Spec §4.5)                      */
/* ------------------------------------------------------------------ */

export const CALENDAR_ITEM_TYPE = Object.freeze({
  HOLIDAY: 'holiday',
  BREAK: 'break',
  LAST_WORKING_DAY: 'last_working_day',
  EVENT: 'event',
});

// affectsClasses is derived from the type on the server. The CR never chooses it.
export const CALENDAR_ITEM_AFFECTS_CLASSES = Object.freeze({
  holiday: true,
  break: true,
  last_working_day: false,
  event: false,
});

/* ------------------------------------------------------------------ */
/* Official schedule: states, limits                                  */
/* ------------------------------------------------------------------ */

export const SCHEDULE_STATUS = Object.freeze({
  DRAFT: 'draft', // only editors see it
  PUBLISHED: 'published', // students can attach
  ARCHIVED: 'archived', // read-only, skipped by sync
});

// State of one item inside a schedule: subject, timetable entry, slot, calendar item,
// class cancel, mass bunk. (Was SCHEDULE_ITEM_STATUS.)
export const ITEM_STATUS = Object.freeze({
  ACTIVE: 'active',
  WITHDRAWN: 'withdrawn',
});

// No maximum span for a calendar item or exam range (Decided). Longer ranges only show a warning.
export const LONG_RANGE_WARNING_DAYS = 31;

// Publisher edit rate limit (per user)
export const SCHEDULE_EDIT_RATE_LIMIT = Object.freeze({
  WINDOW_MS: 10 * 60 * 1000,
  MAX_REQUESTS: 60,
});

/* ------------------------------------------------------------------ */
/* Publisher roles                                                    */
/* ------------------------------------------------------------------ */

// Per-class permission on ScheduleRole. A CR covers one branch and section (all semesters);
// an admin covers a college. Separate from USER_ROLES, the account role on User.
export const SCHEDULE_ROLE = Object.freeze({
  CR: 'cr',
  ADMIN: 'admin',
});

export const SCHEDULE_ROLE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  REVOKED: 'revoked',
});

// More active CRs than this per class (branch and section) is rejected
export const MAX_ACTIVE_CRS_PER_SCHEDULE = 3;

// Wait before the same user can request the same role again after a rejection. Estimate, tune later.
export const ROLE_REQUEST_COOLDOWN_HOURS = 24;

/* ------------------------------------------------------------------ */
/* Edit history                                                       */
/* ------------------------------------------------------------------ */

export const HISTORY_ITEM_KIND = Object.freeze({
  SUBJECT: 'subject',
  TIMETABLE_ENTRY: 'timetable_entry',
  SLOT: 'slot',
  CALENDAR_ITEM: 'calendar_item',
  CLASS_CANCEL: 'class_cancel',
  MASS_BUNK: 'mass_bunk',
  SCHEDULE: 'schedule',
});

export const HISTORY_ACTION = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  WITHDRAW: 'withdraw',
  REVERT: 'revert', // writes a NEW higher revision, never an old one
  PUBLISH: 'publish',
});

/* ------------------------------------------------------------------ */
/* Image import                                                       */
/* ------------------------------------------------------------------ */

export const IMPORT_JOB_STATUS = Object.freeze({
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
  DISCARDED: 'discarded',
});

export const IMPORT_ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const IMPORT_MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

// Unreviewed drafts older than this are removed by a cleanup job
export const IMPORT_DRAFT_EXPIRY_DAYS = 7;

// Image extraction costs money, so limit it per user
export const IMPORT_RATE_LIMIT = Object.freeze({
  WINDOW_MS: 60 * 60 * 1000,
  MAX_REQUESTS: 10,
});

/* ------------------------------------------------------------------ */
/* Shared values                                                      */
/* ------------------------------------------------------------------ */

// "HH:mm", 24-hour
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_MS = 24 * 60 * 60 * 1000;

// Stops people rating a setup they never used: a student must have recorded at least this
// many classes before rating a shared setup.
const MIN_RECORDED_CLASSES_TO_RATE = 10;

export {
  ATTENDANCE_STATUS,
  STATUS_REASON,
  TIME_REGEX,
  DAY_MS,
  MIN_RECORDED_CLASSES_TO_RATE,
};