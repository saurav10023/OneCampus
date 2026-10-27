import API from "./axios";

// API calls used only by the Home page. Self-contained on purpose: it imports nothing
// but the shared axios instance, so it works whatever your other api file is called.

const V1 = "/api/v1";
const S = (id) => `${V1}/setup/${id}`;
const data = (r) => r.data.data;

export const asList = (d, ...keys) => {
  if (Array.isArray(d)) return d;
  for (const k of [...keys, "items", "results"]) if (Array.isArray(d?.[k])) return d[k];
  return [];
};

export const msg = (e, fallback = "Something went wrong") => {
  const d = e?.response?.data;
  if (!d) return e?.message || fallback;
  const more = Array.isArray(d.errors) && d.errors.length ? ` (${d.errors.join(", ")})` : "";
  return `${d.message || fallback}${more}`;
};

const num = (...vals) => {
  for (const v of vals) if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const PALETTE = ["#5B52EE", "#0EA5E9", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6"];
export const colorFor = (key = "") => PALETTE[[...String(key)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
export const initials = (s = "") => s.split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase();

/* ---------- normalizers: turn API shapes into what the UI needs ---------- */

export const normOcc = (o) => ({
  id: o.id ?? o._id,
  subjectId: o.subject?.id,
  name: o.subject?.name || "Class",
  code: o.subject?.code || initials(o.subject?.name),
  color: o.subject?.color || colorFor(o.subject?.id || o.subject?.name),
  start: o.plannedStartTime,
  end: o.plannedEndTime,
  room: o.room || null,
  type: o.classType || "lecture",
  status: o.status || "pending",
  lock: o.lock || null,
});

export const normEvent = (e) => ({
  id: e.id ?? e._id,
  title: e.title,
  type: e.type || "event",
  startDate: String(e.startDate || "").slice(0, 10),
  endDate: String(e.endDate || e.startDate || "").slice(0, 10),
  affectsClasses: Boolean(e.affectsClasses),
  confirmed: e.confirmedAt !== null,
});

// Top-level attendedUnits / heldUnits include extra classes and the ERP match, the same as the
// percentage. The nested `timetable` counts are only a fallback.
export const normAttendance = (a, setupTarget = 75) => {
  const subjects = asList(a, "subjects").map((s) => {
    const t = s.timetable ?? {};
    const att = num(s.attendedUnits, s.attended, t.attendedUnits, t.attended, 0);
    const held = num(s.heldUnits, s.held, t.heldUnits, t.held, 0);
    const info = s.subject ?? s;
    return {
      id: info.id ?? info._id,
      name: info.name,
      code: info.code,
      color: info.color || colorFor(info.id || info.name),
      att,
      held,
      pct: num(s.percentage, t.percentage, held ? (att / held) * 100 : null),
      target: num(info.targetPercentage, s.target, setupTarget),
    };
  });
  const o = a?.overall ?? a?.summary ?? {};
  const att = num(o.attendedUnits, o.attended, subjects.reduce((x, s) => x + s.att, 0));
  const held = num(o.heldUnits, o.held, subjects.reduce((x, s) => x + s.held, 0));
  return { att, held, pct: num(o.percentage, a?.percentage, held ? (att / held) * 100 : null), subjects };
};

/* ---------- requests ---------- */

export const homeApi = {
  activeSetup: async () => {
    const d = data(await API.get(`${V1}/setup/active`));
    return d?.setup ?? d;
  },
  today: async (id) => data(await API.get(`${S(id)}/occurrences/today`)),
  week: async (id) => data(await API.get(`${S(id)}/occurrences/week`, { params: { weekStart: 1 } })),
  attendance: async (id) => data(await API.get(`${S(id)}/attendance`)),
  events: async (id) => asList(data(await API.get(`${S(id)}/calendar-events`)), "events"),
  official: async (id) => data(await API.get(`${S(id)}/official`)),
  joinable: async (id) => asList(data(await API.get(`${S(id)}/official/schedules`)), "schedules"),
  updates: async (id) => asList(data(await API.get(`${S(id)}/official/updates`)), "updates"),
  readAll: async (id) => data(await API.post(`${S(id)}/official/updates/read-all`)),
  roles: async () => asList(data(await API.get(`${V1}/schedule-roles/mine`)), "roles"),
  mark: async (id, occId, status, overrideCancellation = false) =>
    data(await API.patch(`${S(id)}/occurrences/${occId}/status`, { status, overrideCancellation })),
  clear: async (id, occId) => data(await API.delete(`${S(id)}/occurrences/${occId}/status`)),
};