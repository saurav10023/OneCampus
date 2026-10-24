// The attendance endpoints return a per-subject breakdown. These helpers read it
// defensively so small differences in key names do not break the UI.

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
  const held = Number(first(r, "held", "heldUnits", "totalHeld", "conducted", "total") ?? 0);
  const attended = Number(first(r, "attended", "attendedUnits", "present") ?? 0);
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
    target: first(r, "targetPercentage", "target"),
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