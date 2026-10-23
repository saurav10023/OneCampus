import { ITEM_STATUS } from './constants.js';

// Pure rules for the CR action log. Every change to a schedule is an action with a before and
// an after snapshot. Undo is a NEW action that restores the "before"; undoing that undo is a redo.
// History is never edited. A snapshot of null means "does not exist" (before a create, or after
// an undone create), which is stored as a withdrawn record, never a deleted one.

const FIELDS = {
  subject: ['name', 'code', 'status'],
  rule: [
    'subjectKey', 'entryType', 'weekday', 'startTime', 'endTime', 'classType', 'group', 'room',
    'professor', 'attendanceUnits', 'effectiveStartDate', 'effectiveEndDate', 'status',
  ],
  item: [
    'kind', 'title', 'startDate', 'endDate', 'startTime', 'endTime', 'subjectKey', 'slotKey',
    'classType', 'group', 'note', 'status',
  ],
  schedule: ['status', 'groups'],
};
const DATE_FIELDS = new Set(['startDate', 'endDate', 'effectiveStartDate', 'effectiveEndDate']);

const dateText = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : null;

// The part of a record that matters for undo, in one fixed shape. Dates become YYYY-MM-DD,
// and an empty value becomes null, so two equal records always compare equal.
const canonicalSnapshot = (kind, doc) => {
  if (!doc) return null;
  const source = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const out = {};
  for (const field of FIELDS[kind]) {
    let value = source[field];
    if (value === undefined || value === '') value = null;
    if (DATE_FIELDS.has(field)) value = value === null ? null : dateText(value);
    if (field === 'groups') {
      value = (value ?? [])
        .map((g) => ({ key: g.key, label: g.label, kind: g.kind ?? 'lab' }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }
    out[field] = value;
  }
  return out;
};

// Is the record exactly in the state `expected` describes?
const snapshotMatches = (kind, current, expected) => {
  if (expected === null) return current?.status === ITEM_STATUS.WITHDRAWN;
  return JSON.stringify(canonicalSnapshot(kind, current)) === JSON.stringify(canonicalSnapshot(kind, expected));
};

// The fields to write to put a record back to `snapshot`
const statePatch = (kind, snapshot) => {
  if (snapshot === null) return { status: ITEM_STATUS.WITHDRAWN };
  const patch = {};
  for (const field of FIELDS[kind]) {
    const value = snapshot[field];
    patch[field] = DATE_FIELDS.has(field) ? (value ? new Date(`${value}T00:00:00.000Z`) : null) : value;
  }
  return patch;
};

// The action that reverses `action`. Redo is simply an undo of an undo.
const buildUndoAction = (action) => ({
  op: 'undo',
  target: action.target,
  before: action.after,
  after: action.before,
  undoes: action._id,
});

// Why an action cannot be undone now, or null if it can. The record must still be exactly as the
// action left it: otherwise a later change would be silently overwritten.
const undoBlockedReason = (kind, action, current) => {
  if (!current) return 'The record no longer exists';
  if (!snapshotMatches(kind, current, action.after)) {
    return 'This was changed again after that action. Undo the newer change first.';
  }
  return null;
};

export { FIELDS, canonicalSnapshot, snapshotMatches, statePatch, buildUndoAction, undoBlockedReason };