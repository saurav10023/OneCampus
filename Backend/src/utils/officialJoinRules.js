import { suggestMatches } from './subjectMatch.js';
import { ruleKey } from './subjectMergePlan.js';
import { DAY_MS } from './constants.js';

// Pure rules for joining an official schedule. No database.

// Items that become a CalendarEvent in the student's setup. The kind is also the event type.
const EVENT_KINDS = new Set(['holiday', 'break', 'last_working_day', 'event', 'quiz', 'exam']);
// Items that cancel classes without being a calendar event: the class cancel is the cause itself
const CANCEL_KINDS = new Set(['mass_bunk', 'class_cancel']);

// ---------- Subjects ----------

// Decides, for every official subject, whether it links to one of the student's subjects or is added.
//   officialSubjects  [{ key, name, code }]
//   eligibleStudent   [{ id, name, code }]  the student's subjects that are not linked to anything official
//   allStudent        [{ id }]              every subject of the setup
//   explicit          [{ key, studentSubjectId | null }]  the student's own choices (null = add as new)
// An EXACT match (same code, or the same name once normalized) links by itself. A likely or possible
// match is only a suggestion until the student chooses it in `explicit`.
const resolveSubjectMapping = ({ officialSubjects, eligibleStudent, allStudent, explicit = [] }) => {
  const errors = [];
  const keys = new Set(officialSubjects.map((s) => s.key));
  const eligibleIds = new Set(eligibleStudent.map((s) => String(s.id)));
  const allIds = new Set(allStudent.map((s) => String(s.id)));
  const chosen = new Map(); // key -> student subject id, or null
  const usedIds = new Set();

  for (const e of explicit) {
    if (!keys.has(e.key)) { errors.push(`"${e.key}" is not a subject of this schedule`); continue; }
    if (chosen.has(e.key)) { errors.push(`"${e.key}" is chosen twice`); continue; }
    if (e.studentSubjectId !== null) {
      const id = String(e.studentSubjectId);
      if (!allIds.has(id)) { errors.push(`You have no subject with the id ${id}`); continue; }
      if (!eligibleIds.has(id)) { errors.push(`The subject ${id} is already linked to an official subject`); continue; }
      if (usedIds.has(id)) { errors.push(`The subject ${id} is chosen for two official subjects`); continue; }
      usedIds.add(id);
      chosen.set(e.key, id);
    } else {
      chosen.set(e.key, null);
    }
  }

  const { matches } = suggestMatches(officialSubjects, eligibleStudent);
  const links = [];
  const adds = [];
  const suggestions = [];
  for (const m of matches) {
    if (chosen.has(m.key)) {
      const id = chosen.get(m.key);
      if (id) links.push({ key: m.key, studentSubjectId: id, how: 'chosen' });
      else adds.push({ key: m.key });
      continue;
    }
    const free = m.studentSubjectId && !usedIds.has(m.studentSubjectId);
    if (free && m.level === 'exact') {
      usedIds.add(m.studentSubjectId);
      links.push({ key: m.key, studentSubjectId: m.studentSubjectId, how: 'exact', reason: m.reason });
    } else {
      adds.push({ key: m.key });
      if (free && (m.level === 'likely' || m.level === 'possible')) {
        suggestions.push({ key: m.key, studentSubjectId: m.studentSubjectId, level: m.level, score: m.score, reason: m.reason });
      }
    }
  }
  return { links, adds, suggestions, errors };
};

// ---------- Classes ----------

// The dates a class can run on inside the student's setup, or null if it cannot run at all.
// A weekly class with no dates runs the whole setup. A makeup class is one date.
const clampRuleRange = (rule, setupStart, setupEnd) => {
  if (rule.entryType === 'makeup') {
    const date = rule.effectiveStartDate;
    return date && date >= setupStart && date <= setupEnd ? { start: date, end: date } : null;
  }
  const start = rule.effectiveStartDate && rule.effectiveStartDate > setupStart ? rule.effectiveStartDate : setupStart;
  const end = rule.effectiveEndDate && rule.effectiveEndDate < setupEnd ? rule.effectiveEndDate : setupEnd;
  return start <= end ? { start, end } : null;
};

// How many dates with this weekday (0 = Sunday) fall between start and end, inclusive
const countRuleClasses = (weekday, start, end) => {
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days <= 0) return 0;
  const offset = (weekday - start.getUTCDay() + 7) % 7;
  return offset >= days ? 0 : Math.floor((days - 1 - offset) / 7) + 1;
};

// Splits the official classes into: linked to a class the student already has, added, or skipped.
//   subjectLinks           Map official subject key -> student subject id (or missing = a new subject)
//   studentRulesBySubject  Map student subject id -> that subject's RecurringRules
const planRuleJoin = ({ officialRules, knownSubjectKeys, subjectLinks, studentRulesBySubject, chosenGroups, setupStart, setupEnd }) => {
  const link = [];
  const add = [];
  const skipped = { subject: 0, group: 0, range: 0 };
  const used = new Set();

  for (const rule of officialRules) {
    if (!knownSubjectKeys.has(rule.subjectKey)) { skipped.subject += 1; continue; }
    if (rule.group && !chosenGroups.includes(rule.group)) { skipped.group += 1; continue; }
    const range = clampRuleRange(rule, setupStart, setupEnd);
    if (!range) { skipped.range += 1; continue; }

    const studentSubjectId = subjectLinks.get(rule.subjectKey);
    if (studentSubjectId) {
      // The same class (weekday, times, group, class type) the student already has is linked, not copied
      const twin = (studentRulesBySubject.get(String(studentSubjectId)) ?? []).find(
        (r) => !used.has(String(r._id)) && r.origin !== 'official' && ruleKey(r) === ruleKey(rule)
      );
      if (twin) {
        used.add(String(twin._id));
        link.push({ rule, studentRule: twin });
        continue;
      }
    }
    add.push({ rule, range });
  }
  return { link, add, skipped };
};

// ---------- Items ----------

// A mass bunk or class cancel for a group the student is not in does not reach them
const itemAppliesToStudent = (item, chosenGroups) => !item.group || chosenGroups.includes(item.group);

// The class filter for a mass bunk or class cancel. Returns null when it names a subject the student
// does not have, so nothing is cancelled by mistake.
const buildCancelFilter = (item, studentSubjectIdByKey) => {
  const filter = { from: item.startDate, to: item.endDate };
  if (item.subjectKey) {
    const id = studentSubjectIdByKey.get(item.subjectKey);
    if (!id) return null;
    filter.subjectIds = [String(id)];
  }
  if (item.classType) filter.classTypes = [item.classType];
  if (item.group) filter.groups = [item.group];
  if (item.startTime && item.endTime) filter.time = { startTime: item.startTime, endTime: item.endTime };
  return filter;
};

export {
  EVENT_KINDS,
  CANCEL_KINDS,
  resolveSubjectMapping,
  clampRuleRange,
  countRuleClasses,
  planRuleJoin,
  itemAppliesToStudent,
  buildCancelFilter,
};