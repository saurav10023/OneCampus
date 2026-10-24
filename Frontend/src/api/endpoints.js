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
  remove: async (id, confirmName) => unwrap(await API.delete(S(id), { data: { confirmName } })),
};

// ---------------------------------------------------------------------------
// Official schedule join  (/setup/:id/official)
// ---------------------------------------------------------------------------

export const officialApi = {
  status: async (id) => unwrap(await API.get(`${S(id)}/official`)),
  listJoinable: async (id) => asList(unwrap(await API.get(`${S(id)}/official/schedules`)), "schedules"),
  previewJoin: async (id, body) => pick(unwrap(await API.post(`${S(id)}/official/join-preview`, body)), "preview"),
  join: async (id, body) => unwrap(await API.post(`${S(id)}/official/join`, body)),
  leave: async (id, body = {}) => unwrap(await API.post(`${S(id)}/official/leave`, body)),
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
  mark: async (id, occurrenceId, status, overrideCancellation = false) =>
    unwrap(await API.patch(`${S(id)}/occurrences/${occurrenceId}/status`, { status, overrideCancellation })),
  clear: async (id, occurrenceId) => unwrap(await API.delete(`${S(id)}/occurrences/${occurrenceId}/status`)),
};

// ---------------------------------------------------------------------------
// Attendance analytics + ERP match
// ---------------------------------------------------------------------------

export const attendanceApi = {
  overview: async (id, includeArchived = false) =>
    unwrap(await API.get(`${S(id)}/attendance`, { params: { includeArchived } })),
  bunk: async (id, query) => unwrap(await API.get(`${S(id)}/attendance/bunk`, { params: query })),
};

export const extraApi = {
  matchCollege: async (id, subjectId, body) => unwrap(await API.post(`${S(id)}/extra-classes/${subjectId}/match`, body)),
  set: async (id, subjectId, body) => unwrap(await API.put(`${S(id)}/extra-classes/${subjectId}`, body)),
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