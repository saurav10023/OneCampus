import API from "./axios";

// ---------------------------------------------------------------------------
// VITE_API_URL is the server root (e.g. http://localhost:8000), NOT .../api/v1.
// ---------------------------------------------------------------------------

const V1 = "/api/v1";
const S = (setupId) => `${V1}/setup/${setupId}`;
const USER_BASE = `${V1}/users`;

const unwrap = (res) => res.data.data;

export const asList = (d, ...keys) => {
  if (Array.isArray(d)) return d;
  for (const k of [...keys, "items", "results", "docs"]) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
};

export const pick = (d, key) => d?.[key] ?? d;

export const toDateInput = (d) => (d ? String(d).slice(0, 10) : "");

export const errMsg = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data;
  if (!d) return e?.message || fallback;
  const extra = Array.isArray(d.errors) && d.errors.length ? ` (${d.errors.join(", ")})` : "";
  return `${d.message || fallback}${extra}`;
};

// ---------------------------------------------------------------------------
// Setups  (/setup)
// ---------------------------------------------------------------------------

export const setupsApi = {
  list: async (status) => asList(unwrap(await API.get(`${V1}/setup`, { params: status ? { status } : {} })), "setups"),
  active: async () => pick(unwrap(await API.get(`${V1}/setup/active`)), "setup"),
  get: async (id) => pick(unwrap(await API.get(S(id))), "setup"),
  create: async (body) => unwrap(await API.post(`${V1}/setup`, body)), // { setup, archivedSetupId }
  update: async (id, body) => unwrap(await API.patch(S(id), body)), // { setup, warnings }
  archive: async (id) => unwrap(await API.patch(`${S(id)}/archive`)),
  activate: async (id) => unwrap(await API.patch(`${S(id)}/activate`)),
  deleteImpact: async (id) => pick(unwrap(await API.get(`${S(id)}/delete-impact`)), "impact"),
  // A published setup needs alsoUnpublish: true (take the listing down) or false (keep it listed).
  remove: async (id, confirmName, alsoUnpublish) =>
    unwrap(
      await API.delete(S(id), {
        data: { confirmName, ...(alsoUnpublish === undefined ? {} : { alsoUnpublish }) },
      })
    ),
};

// ---------------------------------------------------------------------------
// Official schedule join  (/setup/:id/official)
// The ONE officialApi used everywhere (api/official.js re-exports it).
// confirm: true is required by the backend for join and leave.
// ---------------------------------------------------------------------------

const O = (id) => `${S(id)}/official`;
const listSchedules = async (id) => asList(unwrap(await API.get(`${O(id)}/schedules`)), "schedules");
const previewJoin = async (id, body) => pick(unwrap(await API.post(`${O(id)}/join-preview`, body)), "preview");

export const officialApi = {
  status: async (id) => unwrap(await API.get(O(id))),
  schedules: listSchedules,
  listJoinable: listSchedules, // alias used by OfficialJoin
  preview: previewJoin,
  previewJoin, // alias used by OfficialJoin
  join: async (id, body) => unwrap(await API.post(`${O(id)}/join`, { confirm: true, ...body })),
  leave: async (id, body = {}) => unwrap(await API.post(`${O(id)}/leave`, { confirm: true, ...body })),
  sync: async (id) => unwrap(await API.post(`${O(id)}/sync`)),
  updates: async (id) => asList(unwrap(await API.get(`${O(id)}/updates`)), "updates"),
  readAll: async (id) => unwrap(await API.post(`${O(id)}/updates/read-all`)),
  read: async (id, updateId) => unwrap(await API.post(`${O(id)}/updates/${updateId}/read`)),
  accept: async (id, updateId, body = {}) => unwrap(await API.post(`${O(id)}/updates/${updateId}/accept`, body)),
  dismiss: async (id, updateId) => unwrap(await API.post(`${O(id)}/updates/${updateId}/dismiss`)),
  optOuts: async (id) => asList(unwrap(await API.get(`${O(id)}/opt-outs`)), "optOuts", "items"),
  restore: async (id, kind, itemId) => unwrap(await API.delete(`${O(id)}/opt-outs/${kind}/${itemId}`)),
};

// ---------------------------------------------------------------------------
// Subjects  (/setup/:id/subjects)
// ---------------------------------------------------------------------------

export const subjectsApi = {
  list: async (id, query) => unwrap(await API.get(`${S(id)}/subjects`, { params: query })), // { subjects, pagination }
  create: async (id, body) => unwrap(await API.post(`${S(id)}/subjects`, body)),
  update: async (id, subjectId, body) => unwrap(await API.patch(`${S(id)}/subjects/${subjectId}`, body)),
  archive: async (id, subjectId) => unwrap(await API.patch(`${S(id)}/subjects/${subjectId}/archive`)),
  restore: async (id, subjectId) => unwrap(await API.patch(`${S(id)}/subjects/${subjectId}/restore`)),
  deleteImpact: async (id, subjectId) => pick(unwrap(await API.get(`${S(id)}/subjects/${subjectId}/delete-impact`)), "impact"),
  remove: async (id, subjectId, confirmName) =>
    unwrap(await API.delete(`${S(id)}/subjects/${subjectId}`, { data: { confirmName } })),
};

// ---------------------------------------------------------------------------
// Weekly rules  (/setup/:id/rules)
// ---------------------------------------------------------------------------

export const rulesApi = {
  list: async (id, query) => asList(unwrap(await API.get(`${S(id)}/rules`, { params: query })), "rules"),
  create: async (id, body) => unwrap(await API.post(`${S(id)}/rules`, body)), // { rule, generated, cancelledByEvents, warnings }
  update: async (id, ruleId, body) => unwrap(await API.patch(`${S(id)}/rules/${ruleId}`, body)),
  deleteImpact: async (id, ruleId) => pick(unwrap(await API.get(`${S(id)}/rules/${ruleId}/delete-impact`)), "impact"),
  remove: async (id, ruleId, confirm = false) => unwrap(await API.delete(`${S(id)}/rules/${ruleId}`, { data: { confirm } })),
};

// ---------------------------------------------------------------------------
// Occurrences + attendance marking  (/setup/:id/occurrences)
// ---------------------------------------------------------------------------

export const occurrencesApi = {
  today: async (id, date) => unwrap(await API.get(`${S(id)}/occurrences/today`, { params: date ? { date } : {} })),
  week: async (id, date, weekStart = 1) =>
    unwrap(await API.get(`${S(id)}/occurrences/week`, { params: { ...(date ? { date } : {}), weekStart } })),
  // Classes between two dates (max 93 days per call). params: { from, to, subjectId?, status? }
  // Returns { occurrences, count, summary }.
  range: async (id, params) => unwrap(await API.get(`${S(id)}/occurrences`, { params })),
  mark: async (id, occurrenceId, status, overrideCancellation = false) =>
    unwrap(await API.patch(`${S(id)}/occurrences/${occurrenceId}/status`, { status, overrideCancellation })),
  clear: async (id, occurrenceId) => unwrap(await API.delete(`${S(id)}/occurrences/${occurrenceId}/status`)),
};

// ---------------------------------------------------------------------------
// Attendance analytics + college-record (ERP) match
// ---------------------------------------------------------------------------

export const attendanceApi = {
  overview: async (id, includeArchived = false) =>
    unwrap(await API.get(`${S(id)}/attendance`, { params: { includeArchived } })),
  bunk: async (id, query) => unwrap(await API.get(`${S(id)}/attendance/bunk`, { params: query })),
};

export const extraApi = {
  matchCollege: async (id, subjectId, body) => unwrap(await API.post(`${S(id)}/extra-classes/${subjectId}/match`, body)),
  set: async (id, subjectId, body) => unwrap(await API.put(`${S(id)}/extra-classes/${subjectId}`, body)),
  remove: async (id, subjectId) => unwrap(await API.delete(`${S(id)}/extra-classes/${subjectId}`)),
};

// ---------------------------------------------------------------------------
// Calendar events  (/setup/:id/calendar-events)
// ---------------------------------------------------------------------------

export const eventsApi = {
  list: async (id, params) => asList(unwrap(await API.get(`${S(id)}/calendar-events`, { params })), "events"),
  create: async (id, body) => unwrap(await API.post(`${S(id)}/calendar-events`, body)),
  update: async (id, eventId, body) => unwrap(await API.patch(`${S(id)}/calendar-events/${eventId}`, body)),
  confirm: async (id, eventId) => unwrap(await API.post(`${S(id)}/calendar-events/${eventId}/confirm`)),
  remove: async (id, eventId) => unwrap(await API.delete(`${S(id)}/calendar-events/${eventId}`)),
};

// ---------------------------------------------------------------------------
// Profile  (/users/me)
// ---------------------------------------------------------------------------

export const profileApi = {
  update: async (fields, avatarFile) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => v !== undefined && fd.append(k, v));
    if (avatarFile) fd.append("avatar", avatarFile);
    return unwrap(await API.patch(`${USER_BASE}/me`, fd));
  },
  requestDeletion: async () => unwrap(await API.delete(`${USER_BASE}/me`)),
};

// ---------------------------------------------------------------------------
// CR / Admin: schedule roles  (/schedule-roles)
// ---------------------------------------------------------------------------

const ROLES = `${V1}/schedule-roles`;

export const scheduleRolesApi = {
  mine: async () => asList(unwrap(await API.get(`${ROLES}/mine`)), "roles"),
  requests: async (params) => asList(unwrap(await API.get(`${ROLES}/requests`, { params })), "requests", "roles"),
  request: async (body) => unwrap(await API.post(ROLES, body)),
  approve: async (id, note) => unwrap(await API.patch(`${ROLES}/${id}/approve`, { note })),
  reject: async (id, note) => unwrap(await API.patch(`${ROLES}/${id}/reject`, { note })),
  revoke: async (id, note) => unwrap(await API.patch(`${ROLES}/${id}/revoke`, { note })),
  withdraw: async (id) => unwrap(await API.patch(`${ROLES}/${id}/withdraw`)),
};

// ---------------------------------------------------------------------------
// CR / Admin: official schedules  (/official-schedules)
// ---------------------------------------------------------------------------

const OS = (id) => `${V1}/official-schedules/${id}`;

// Sub-resources (subjects / rules / items) share the same verbs.
// listFn lets a resource change how listing works (withdrawn records must stay visible).
const child = (name, listKey, listFn) => ({
  list:
    listFn ||
    (async (id, params) => asList(unwrap(await API.get(`${OS(id)}/${name}`, { params })), listKey)),
  create: async (id, body) => unwrap(await API.post(`${OS(id)}/${name}`, body)),
  update: async (id, childId, body) => unwrap(await API.patch(`${OS(id)}/${name}/${childId}`, body)),
  withdraw: async (id, childId, note) => unwrap(await API.post(`${OS(id)}/${name}/${childId}/withdraw`, { note })),
  restore: async (id, childId, note) => unwrap(await API.post(`${OS(id)}/${name}/${childId}/restore`, { note })),
});

// Subjects and rules: status "all" returns active and withdrawn together.
const listAll = (name, listKey) => async (id, params) =>
  asList(unwrap(await API.get(`${OS(id)}/${name}`, { params: { status: "all", ...params } })), listKey);

// Items have no "all": fetch active and withdrawn, then merge.
const listItemsAll = async (id, params) => {
  const get = async (status) =>
    asList(unwrap(await API.get(`${OS(id)}/items`, { params: { ...params, status } })), "items");
  const [active, withdrawn] = await Promise.all([get("active"), get("withdrawn")]);
  const seen = new Set();
  return [...active, ...withdrawn].filter((x) => {
    const k = x._id || x.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

export const officialSchedulesApi = {
  list: async (params) => asList(unwrap(await API.get(`${V1}/official-schedules`, { params })), "schedules"),
  get: async (id) => pick(unwrap(await API.get(OS(id))), "schedule"),
  create: async (body) => unwrap(await API.post(`${V1}/official-schedules`, body)),
  update: async (id, body) => unwrap(await API.patch(OS(id), body)),
  publish: async (id, note) => unwrap(await API.post(`${OS(id)}/publish`, { note })),
  unpublish: async (id, note) => unwrap(await API.post(`${OS(id)}/unpublish`, { note })),
  archive: async (id, note) => unwrap(await API.post(`${OS(id)}/archive`, { note })),

  subjects: child("subjects", "subjects", listAll("subjects", "subjects")),
  rules: child("rules", "rules", listAll("rules", "rules")),
  items: child("items", "items", listItemsAll),

  actions: {
    list: async (id, params) => asList(unwrap(await API.get(`${OS(id)}/actions`, { params })), "actions"),
    impactPreview: async (id, body) => unwrap(await API.post(`${OS(id)}/actions/impact-preview`, body)),
    undo: async (id, actionId, note) => unwrap(await API.post(`${OS(id)}/actions/${actionId}/undo`, { note })),
    redo: async (id, actionId, note) => unwrap(await API.post(`${OS(id)}/actions/${actionId}/redo`, { note })),
    revert: async (id, actionId, note) => unwrap(await API.post(`${OS(id)}/actions/${actionId}/revert`, { note })),
  },
};