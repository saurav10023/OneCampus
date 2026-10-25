// The attendance endpoints return a per-subject breakdown. The readers below are defensive
// so small differences in key names (or values nested under `timetable`) do not break the UI.

const first = (o, ...keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

export const rowsOf = (d) => {
  if (Array.isArray(d)) return d;
  for (const k of ["subjects", "breakdown", "perSubject", "bySubject", "items", "rows"]) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
};

export const readRow = (r = {}) => {
  const t = r.timetable;
  const held = Number(first(r, "held", "heldUnits", "totalHeld", "conducted", "total") ?? first(t, "heldUnits", "held") ?? 0);
  const attended = Number(first(r, "attended", "attendedUnits", "present") ?? first(t, "attendedUnits", "attended") ?? 0);
  let pct = first(r, "percentage", "currentPercentage", "percent", "attendancePercentage");
  if (pct == null) pct = held > 0 ? (attended / held) * 100 : null;

  const sid = r.subjectId;
  return {
    id: (sid && typeof sid === "object" ? sid._id : sid) || r.subject?.id || r.subject?._id || r._id || r.id,
    name: r.subject?.name || r.subjectName || r.name || (sid && typeof sid === "object" ? sid.name : "") || "Subject",
    code: r.subject?.code || r.code || (sid && typeof sid === "object" ? sid.code : ""),
    color: r.subject?.color || r.color || "",
    held,
    attended,
    pct: pct == null ? null : Math.round(Number(pct) * 10) / 10,
    target: first(r, "targetPercentage", "target") ?? r.subject?.targetPercentage,
    safe: first(r, "safeBunks", "canBunk", "bunkable", "classesCanSkip", "safeToSkip"),
    needed: first(r, "classesNeeded", "needed", "mustAttend", "classesToAttend", "neededToReachTarget"),
  };
};

// Overall % across all rows (uses `overall` from the API when present)
export const overallOf = (data) => {
  if (data?.overall && typeof data.overall === "object") return readRow(data.overall);
  const rows = rowsOf(data).map(readRow);
  const held = rows.reduce((a, r) => a + r.held, 0);
  const attended = rows.reduce((a, r) => a + r.attended, 0);
  return { held, attended, pct: held > 0 ? Math.round((attended / held) * 1000) / 10 : null };
};

/* ------------------------------------------------------------------------------------------
   Prediction math. Everything is in "class units" (a 2-unit lab counts twice), the same way
   the server counts. `a` = attended, `h` = held, `left` = class units still to happen
   (holidays and cancelled classes already excluded), `target` = percentage (0-100).
------------------------------------------------------------------------------------------ */

export const round1 = (n) => Math.round(n * 10) / 10;

export const pctOf = (a, h) => (h > 0 ? (a / h) * 100 : null);

// After skipping k more classes (held grows, attended does not)
export const afterSkip = (a, h, k) => pctOf(a, h + k);

// After attending k more classes in a row
export const afterAttend = (a, h, k) => pctOf(a + k, h + k);

// Skips if you never attended again: largest k with a / (h + k) >= target.
// Used only as a fallback when the number of remaining classes is not known.
export const skipBudget = (a, h, target) => {
  const t = Number(target) / 100;
  if (h <= 0) return 0;
  if (!(t > 0)) return Infinity;
  return Math.max(0, Math.floor(a / t - h + 1e-9));
};

// How many classes in a row you must attend to reach the target (0 when already there).
// Smallest n with (a + n) / (h + n) >= target. Infinity when the target is 100% and a class was missed.
export const needToAttend = (a, h, target) => {
  const t = Number(target) / 100;
  if (h <= 0) return 0;
  if (a / h >= t - 1e-12) return 0;
  if (t >= 1) return Infinity;
  return Math.ceil((t * h - a) / (1 - t) - 1e-9);
};

// Semester-aware plan: what the rest of the semester allows.
//   best       = finish % if you attend every remaining class
//   worst      = finish % if you skip every remaining class
//   mustAttend = fewest remaining classes you must attend to finish at the target
//   canSkip    = remaining classes you can skip and still finish at the target
export const semesterPlan = (a, h, left, target) => {
  const total = h + left;
  if (!(total > 0)) return null;
  const t = Number(target) / 100;
  const mustAttend = Math.max(0, Math.ceil(t * total - a - 1e-9));
  const canReach = mustAttend <= left;
  return {
    total,
    best: pctOf(a + left, total),
    worst: pctOf(a, total),
    mustAttend,
    canReach,
    canSkip: canReach ? left - mustAttend : 0,
  };
};

// "safe" = comfortably above target, "close" = within 3 points above it, "below" = under it.
export const statusOf = (pct, target) => {
  if (pct == null) return "none";
  if (pct < Number(target)) return "below";
  if (pct - Number(target) < 3) return "close";
  return "safe";
};

export const STATUS_META = {
  safe: { label: "On track", tone: "green" },
  close: { label: "Close to target", tone: "amber" },
  below: { label: "Below target", tone: "red" },
  none: { label: "No data yet", tone: "neutral" },
};

// "1 class", "2 classes", "3 subjects"
export const plural = (n, word) => `${n} ${n === 1 ? word : /(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`}`;

// Shared tone classes so the page and the planner always match.
export const toneText = {
  ink: "text-[#161827]",
  green: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-rose-600",
  neutral: "text-[#6A6F85]",
};

export const toneBox = {
  green: "bg-emerald-500/10 border-emerald-200 text-emerald-800",
  amber: "bg-amber-500/10 border-amber-200 text-amber-800",
  red: "bg-rose-500/10 border-rose-200 text-rose-800",
  neutral: "bg-white/60 border-white/80 text-[#444A63]",
};

export const toneDot = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  neutral: "bg-slate-400",
};