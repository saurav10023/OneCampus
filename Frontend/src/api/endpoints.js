import API from "./axios";

// ---------------------------------------------------------------------------
// Base paths. app.js mounts setups at /api/v1/setup (singular).
// If your routes are /api/v1/setups, change this one line.
// ---------------------------------------------------------------------------

export const SETUP_BASE = "/api/v1/setup";
const USER_BASE = "/api/v1/users";

// ---------------------------------------------------------------------------
// Helpers: every backend reply is { data: ... } (ApiResponse)
// ---------------------------------------------------------------------------

const unwrap = (res) => res.data.data;

// Lists may come back as [] or { setups: [] } / { items: [] } ...
export const asList = (d, ...keys) => {
  if (Array.isArray(d)) return d;
  for (const k of [...keys, "items", "results", "docs"]) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
};

// A single record may come back bare or wrapped: { setup: {...} }
export const pick = (d, key) => d?.[key] ?? d;

export const toDateInput = (d) => (d ? String(d).slice(0, 10) : "");

export const errMsg = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data;
  if (!d) return e?.message || fallback;
  const extra = Array.isArray(d.errors) && d.errors.length ? ` (${d.errors.join(", ")})` : "";
  return `${d.message || fallback}${extra}`;
};

// ---------------------------------------------------------------------------
// Setups
// ---------------------------------------------------------------------------

export const setupsApi = {
  list: async (status) =>
    asList(unwrap(await API.get(SETUP_BASE, { params: status ? { status } : {} })), "setups"),
  get: async (id) => pick(unwrap(await API.get(`${SETUP_BASE}/${id}`)), "setup"),
  create: async (body) => unwrap(await API.post(SETUP_BASE, body)),
  update: async (id, body) => unwrap(await API.patch(`${SETUP_BASE}/${id}`, body)),
  archive: async (id) => unwrap(await API.patch(`${SETUP_BASE}/${id}/archive`)),
  activate: async (id) => unwrap(await API.patch(`${SETUP_BASE}/${id}/activate`)),
  deleteImpact: async (id) => unwrap(await API.get(`${SETUP_BASE}/${id}/delete-impact`)),
  remove: async (id, body) => unwrap(await API.delete(`${SETUP_BASE}/${id}`, { data: body })),
};

// ---------------------------------------------------------------------------
// Subjects  (/setup/:setupId/subjects)
// ---------------------------------------------------------------------------

export const subjectsApi = {
  list: async (setupId) =>
    asList(unwrap(await API.get(`${SETUP_BASE}/${setupId}/subjects`)), "subjects"),
  create: async (setupId, body) =>
    unwrap(await API.post(`${SETUP_BASE}/${setupId}/subjects`, body)),
  update: async (setupId, id, body) =>
    unwrap(await API.patch(`${SETUP_BASE}/${setupId}/subjects/${id}`, body)),
  remove: async (setupId, id) =>
    unwrap(await API.delete(`${SETUP_BASE}/${setupId}/subjects/${id}`)),
};

// ---------------------------------------------------------------------------
// Calendar events  (/setup/:setupId/calendar-events)
// ---------------------------------------------------------------------------

export const eventsApi = {
  list: async (setupId, params) =>
    asList(
      unwrap(await API.get(`${SETUP_BASE}/${setupId}/calendar-events`, { params })),
      "events",
      "calendarEvents"
    ),
  create: async (setupId, body) =>
    unwrap(await API.post(`${SETUP_BASE}/${setupId}/calendar-events`, body)),
  update: async (setupId, id, body) =>
    unwrap(await API.patch(`${SETUP_BASE}/${setupId}/calendar-events/${id}`, body)),
  confirm: async (setupId, id) =>
    unwrap(await API.patch(`${SETUP_BASE}/${setupId}/calendar-events/${id}/confirm`)),
  remove: async (setupId, id) =>
    unwrap(await API.delete(`${SETUP_BASE}/${setupId}/calendar-events/${id}`)),
};

// ---------------------------------------------------------------------------
// Profile  (/users/me)
// ---------------------------------------------------------------------------

export const profileApi = {
  // multipart so the optional avatar upload (multer) also works
  update: async (fields, avatarFile) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => v !== undefined && fd.append(k, v));
    if (avatarFile) fd.append("avatar", avatarFile);
    return unwrap(await API.patch(`${USER_BASE}/me`, fd));
  },
  requestDeletion: async () => unwrap(await API.delete(`${USER_BASE}/me`)),
};