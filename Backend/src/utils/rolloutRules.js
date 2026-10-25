// Pure counting rules for the CR's rollout view. No database, and no student is ever named:
// the view only says how many students are where.

// How far behind a student is, in schedule revisions. One revision is one CR change.
const SLIGHTLY_BEHIND_MAX = 5;
const BEHIND_MAX = 25;

const bucketOf = (behind) =>
  behind <= 0 ? 'upToDate' : behind <= SLIGHTLY_BEHIND_MAX ? 'slightly' : behind <= BEHIND_MAX ? 'behind' : 'far';

// What a pending line means for the CR
const PENDING_LABEL = Object.freeze({
  'rule:updated': 'changedClass',
  'rule:withdrawn': 'removedClass',
  'subject:conflict': 'subjectClash',
});
const pendingKind = (targetKind, change) => PENDING_LABEL[`${targetKind}:${change}`] ?? 'other';

// schedule:    { contentRevision, groups: [{ key, label }] }
// setups:      [{ _id, status, lastSyncedContentRevision, officialGroups }]  every setup joined to it
// pendingRows: [{ _id: { setupId, kind, change }, n }]  pending update lines, grouped
// Only ACTIVE setups are counted: an archived setup no longer syncs.
const buildRollout = ({ schedule, setups, pendingRows }) => {
  const active = setups.filter((s) => s.status === 'active');
  const latest = schedule.contentRevision ?? 0;

  const students = {
    joined: active.length,
    archivedSetups: setups.length - active.length,
    upToDate: 0,
    behind: 0,
    behindBy: { slightly: 0, behind: 0, far: 0 },
    oldestRevision: null,
  };
  for (const s of active) {
    const last = s.lastSyncedContentRevision ?? 0;
    const bucket = bucketOf(latest - last);
    if (bucket === 'upToDate') {
      students.upToDate += 1;
    } else {
      students.behind += 1;
      students.behindBy[bucket] += 1;
    }
    if (students.oldestRevision === null || last < students.oldestRevision) students.oldestRevision = last;
  }

  // Pending lines count only for setups that are still joined and active
  const activeIds = new Set(active.map((s) => String(s._id)));
  const pendingStudents = new Set();
  const pending = { students: 0, updates: 0, byKind: { changedClass: 0, removedClass: 0, subjectClash: 0, other: 0 } };
  for (const row of pendingRows) {
    const id = String(row._id.setupId);
    if (!activeIds.has(id)) continue;
    pendingStudents.add(id);
    pending.updates += row.n;
    pending.byKind[pendingKind(row._id.kind, row._id.change)] += row.n;
  }
  pending.students = pendingStudents.size;

  // A student in two groups counts in both. Students who picked none are counted apart.
  const perGroup = new Map((schedule.groups ?? []).map((g) => [g.key, { key: g.key, label: g.label, students: 0 }]));
  let withoutGroup = 0;
  for (const s of active) {
    const picked = (s.officialGroups ?? []).filter((key) => perGroup.has(key));
    if (!picked.length) withoutGroup += 1;
    for (const key of picked) perGroup.get(key).students += 1;
  }

  return { students, pending, groups: [...perGroup.values()], studentsWithoutGroup: withoutGroup };
};

export { SLIGHTLY_BEHIND_MAX, BEHIND_MAX, bucketOf, pendingKind, buildRollout };