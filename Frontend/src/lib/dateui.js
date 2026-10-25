// Small date helpers for the UI. All inputs are "YYYY-MM-DD" (or ISO) strings.

const DAY = 86400000;

export const isoOf = (d) => (d ? String(d).slice(0, 10) : "");
const utc = (iso) => new Date(`${isoOf(iso)}T00:00:00Z`);

// Today's date in the visitor's own timezone, as YYYY-MM-DD
export const todayISO = () => new Date().toLocaleDateString("en-CA");

export const dayNum = (iso) => utc(iso).getUTCDate();
export const monthShort = (iso) => utc(iso).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
export const monthKey = (iso) => isoOf(iso).slice(0, 7);
export const monthLabel = (iso) => utc(iso).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const daysBetween = (a, b) => Math.round((utc(b).getTime() - utc(a).getTime()) / DAY) + 1;

// How far through the semester we are
export const semesterProgress = (start, end) => {
  const s = utc(start).getTime();
  const e = utc(end).getTime();
  const now = utc(todayISO()).getTime();

  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return { pct: 0, state: "unknown", label: "" };

  if (now < s) {
    const d = Math.round((s - now) / DAY);
    return { pct: 0, state: "upcoming", label: `Starts in ${d} day${d === 1 ? "" : "s"}` };
  }
  if (now > e) return { pct: 100, state: "ended", label: "Semester ended" };

  const total = Math.round((e - s) / DAY) + 1;
  const day = Math.round((now - s) / DAY) + 1;
  const left = total - day;
  return {
    pct: Math.round((day / total) * 100),
    state: "running",
    label: `Day ${day} of ${total} · ${left} day${left === 1 ? "" : "s"} left`,
    day,
    total,
    left,
  };
};