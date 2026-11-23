import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { eventsApi, occurrencesApi, errMsg, toDateInput } from "../api/endpoints";
import { normOcc } from "../api/home";
import { Alert, cx } from "../components/Ui";

/* ------------------------------------------------------------------ *
 *  Calendar: month grid + day detail, flat OneCampus styling.
 *  Route it inside the same layout as Attendance (it reads `setup`
 *  from the outlet context), e.g. <Route path="calendar" element={<Calendar />} />
 *
 *  Layout switches use container queries (@container / @2xl:), so the grid
 *  adapts to the space it really has, whether the desktop sidebar is open or not.
 * ------------------------------------------------------------------ */

/* ---------- date helpers (plain YYYY-MM-DD strings, UTC math, no DST surprises) ---------- */
const DAY = 86400000;
const toUtc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (iso, n) => fromUtc(toUtc(iso) + n * DAY);
const dowMon = (iso) => (new Date(toUtc(iso)).getUTCDay() + 6) % 7; // Monday = 0
const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
const gridFor = (y, m) => {
  const first = `${monthKey(y, m)}-01`;
  const start = addDays(first, -dowMon(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
const shiftMonth = (y, m, n) => { const t = new Date(Date.UTC(y, m + n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; };
const todayIn = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Kolkata" }).format(new Date());

const F_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const F_LONG = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const F_WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" });
const F_ARIA = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const at = (f, iso) => f.format(new Date(toUtc(iso)));
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------- data shaping ---------- */
const occList = (res) => {
  if (Array.isArray(res)) return res;
  for (const x of [res, res?.data, res?.data?.data]) if (Array.isArray(x?.occurrences)) return x.occurrences;
  return [];
};
const occDate = (o) => String(o?.date ?? o?.occurrenceDate ?? o?.day ?? "").slice(0, 10);
const byStart = (a, b) => String(a.start).localeCompare(String(b.start));
const normEv = (e) => {
  const start = toDateInput(e.startDate ?? e.date ?? e.start);
  const end = toDateInput(e.endDate ?? e.end) || start;
  return { id: e.id ?? e._id ?? `${e.title}-${start}`, title: e.title || e.name || "Event", type: e.type || "other", start, end, draft: e.confirmed === false };
};

/* ---------- look-up tables (status colours always come with a text label) ---------- */
const STATUS = {
  present: { label: "Present", pill: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  absent: { label: "Absent", pill: "bg-rose-50 text-[#A32A42] border-rose-200" },
  excused: { label: "Excused", pill: "bg-sky-50 text-sky-700 border-sky-200" },
  cancelled: { label: "Cancelled", pill: "bg-[color:var(--inset)] text-[color:var(--body)] border-[color:var(--line)]" },
  not_counted: { label: "Not counted", pill: "bg-amber-50 text-amber-900 border-amber-200" },
  pending: { label: "Upcoming", pill: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  unmarked: { label: "Not marked", pill: "bg-amber-50 text-amber-900 border-amber-200" },
};
const DOT = { present: "#10B981", absent: "#F43F5E", excused: "#0EA5E9", cancelled: "#9AA0B5", not_counted: "#F59E0B" };
const statusFor = (c, date, today) => (c.status === "pending" ? (date < today ? STATUS.unmarked : STATUS.pending) : STATUS[c.status] || STATUS.pending);

const EV = {
  holiday: { label: "Holiday", bar: "bg-amber-500", soft: "bg-amber-50 text-amber-900", card: "border-amber-200 bg-amber-50 text-amber-900" },
  exam: { label: "Exam", bar: "bg-rose-500", soft: "bg-rose-50 text-[#A32A42]", card: "border-rose-200 bg-rose-50 text-[#A32A42]" },
  quiz: { label: "Quiz", bar: "bg-sky-500", soft: "bg-sky-50 text-sky-700", card: "border-sky-200 bg-sky-50 text-sky-700" },
  other: { label: "Event", bar: "bg-[color:var(--faint)]", soft: "bg-[color:var(--inset)] text-[color:var(--body)]", card: "border-[color:var(--line)] bg-[color:var(--inset)] text-[color:var(--body)]" },
};
const evTone = (e) => EV[e.type] || EV.other;

/* ---------- shared bits ---------- */
const SEL = "bg-[#4F46E5] border-[#4F46E5] text-white";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

// White card with a hairline border
const Panel = ({ className, children }) => (
  <section className={cx("relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] shadow-[0_1px_2px_rgba(27,31,51,0.04)] min-w-0", className)}>
    {children}
  </section>
);

// Secondary (frosted) button
const GlassBtn = ({ className, ...p }) => (
  <button
    type="button"
    {...p}
    className={cx(
      "inline-flex items-center justify-center rounded-xl border border-[color:var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] backdrop-blur-md text-[color:var(--ink)] transition-colors",
      "hover:bg-[color:var(--surface)] hover:border-[color:var(--line-strong)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none motion-reduce:transition-none",
      FOCUS,
      className
    )}
  />
);

const Dot = ({ c, onDark }) => {
  const base = DOT[c.status];
  const col = c.color || "#4F46E5";
  const style = base
    ? { background: base }
    : { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${onDark ? "rgba(255,255,255,.95)" : col}` };
  return <span className={cx("h-2 w-2 rounded-full shrink-0", base && onDark && "ring-1 ring-white/80")} style={style} />;
};

/* ---------- one day cell ---------- */
const Cell = ({ date, inMonth, selected, isToday, classes, events, tabIndex, onPick }) => {
  const shown = classes.slice(0, 3);
  const more = classes.length - shown.length;
  const ev = events[0];
  const label = `${at(F_ARIA, date)}, ${classes.length === 0 ? "no classes" : `${classes.length} ${classes.length === 1 ? "class" : "classes"}`}${events.length ? `, ${events.map((e) => e.title).join(", ")}` : ""}`;
  return (
    <button
      type="button"
      data-date={date}
      tabIndex={tabIndex}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onPick(date)}
      className={cx(
        "relative flex min-h-[60px] min-w-0 flex-col rounded-xl border p-1.5 text-left transition-colors active:scale-[0.98] @2xl:min-h-[108px] @2xl:p-2 motion-reduce:transition-none motion-reduce:active:scale-100",
        FOCUS,
        selected ? SEL : inMonth ? "border-[color:var(--line)] bg-[color:var(--surface)] hover:border-[color:var(--line-strong)]" : "border-transparent bg-[color:var(--inset)] hover:border-[color:var(--line)]"
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cx(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums",
            isToday
              ? selected ? "bg-[color:var(--surface)] text-[#4F46E5]" : "bg-[#4F46E5] text-white"
              : selected ? "text-white" : inMonth ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"
          )}
        >
          {Number(date.slice(8))}
        </span>
        {classes.length > 0 && (
          <span className={cx("hidden text-[11px] font-medium tabular-nums @2xl:inline", selected ? "text-white/85" : "text-[color:var(--muted)]")}>{classes.length}</span>
        )}
      </span>

      {/* wide: class chips (grey inset, subject colour bar on the left) */}
      <span className="mt-1 hidden min-w-0 flex-col gap-1 @2xl:flex">
        {shown.map((c) => (
          <span
            key={c.id}
            className={cx(
              "flex min-w-0 items-center gap-1 rounded-md border-l-[3px] px-1.5 py-0.5 text-[11px] font-medium leading-tight",
              selected ? "bg-white/20 text-white" : "bg-[color:var(--inset)] text-[color:var(--ink)]",
              c.status === "cancelled" && "line-through opacity-70"
            )}
            style={{ borderLeftColor: c.color || "#4F46E5" }}
          >
            <Dot c={c} onDark={selected} />
            <span className="truncate">{c.start} {c.code || c.name}</span>
          </span>
        ))}
        {more > 0 && <span className={cx("px-1 text-[11px] font-medium", selected ? "text-white/85" : "text-[color:var(--muted)]")}>+{more} more</span>}
      </span>

      {/* narrow: dots */}
      <span className="mt-auto flex flex-wrap gap-[3px] pt-1 @2xl:hidden">
        {classes.slice(0, 5).map((c) => <Dot key={c.id} c={c} onDark={selected} />)}
      </span>

      {ev && (
        <>
          <span aria-hidden="true" className={cx("mt-1 h-1 rounded-full @2xl:hidden", selected ? "bg-[color-mix(in_srgb,var(--surface)_80%,transparent)]" : evTone(ev).bar)} />
          <span
            className={cx(
              "mt-auto hidden truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold @2xl:block",
              selected ? "bg-white/25 text-white" : evTone(ev).soft,
              ev.draft && "border border-dashed border-current/40"
            )}
          >
            {ev.title}{events.length > 1 ? ` +${events.length - 1}` : ""}
          </span>
        </>
      )}
    </button>
  );
};

// Inset stat tile
const Tile = ({ label, value, tone, loading }) => (
  <div className="min-w-0 rounded-xl bg-[color:var(--inset)] px-3 py-2.5">
    <p className="text-[12px] text-[color:var(--muted)]">{label}</p>
    <p className={cx("text-[22px] font-semibold leading-tight tabular-nums", tone || "text-[color:var(--ink)]")}>
      {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded-md bg-[color:var(--line-soft)] align-middle motion-reduce:animate-none" /> : value}
    </p>
  </div>
);

const CSS = `
@keyframes cal-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes cal-bar{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
.cal-in{animation:cal-in .3s cubic-bezier(0.32,0.72,0,1) both}
.cal-bar{animation:cal-bar 1.1s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.cal-in,.cal-bar{animation:none}}
`;

/* ================================================================== */
export default function Calendar() {
  const { setup } = useOutletContext();
  const setupId = setup._id;
  const today = useMemo(() => todayIn(setup.timezone), [setup.timezone]);

  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [months, setMonths] = useState({}); // `${setupId}|${YYYY-MM}` -> { status, days, message }
  const [events, setEvents] = useState([]);
  const [evError, setEvError] = useState(false);

  const asked = useRef(new Set());
  const gridRef = useRef(null);
  const focusNext = useRef(null);
  const touch = useRef(null);

  const mk = monthKey(cursor.y, cursor.m);
  const cacheKey = `${setupId}|${mk}`;
  const grid = useMemo(() => gridFor(cursor.y, cursor.m), [cursor]);
  const cur = months[cacheKey];

  /* classes for the visible 6-week grid (one request per month, cached) */
  const loadMonth = useCallback(async (ck, g) => {
    if (asked.current.has(ck)) return;
    asked.current.add(ck);
    setMonths((s) => ({ ...s, [ck]: { status: "loading", days: s[ck]?.days || {} } }));
    try {
      const res = await occurrencesApi.range(setupId, { from: g[0], to: g[g.length - 1] });
      const days = Object.fromEntries(g.map((d) => [d, []]));
      for (const o of occList(res)) {
        const d = occDate(o);
        if (days[d]) days[d].push({ ...normOcc(o), date: d });
      }
      Object.values(days).forEach((a) => a.sort(byStart));
      setMonths((s) => ({ ...s, [ck]: { status: "ready", days } }));
    } catch (e) {
      console.error("Calendar: could not load", ck, e);
      asked.current.delete(ck);
      setMonths((s) => ({ ...s, [ck]: { status: "error", days: s[ck]?.days || {}, message: errMsg(e, "Could not load this month") } }));
    }
  }, [setupId]);

  useEffect(() => { loadMonth(cacheKey, grid); }, [cacheKey, grid, loadMonth]);

  /* holidays, exams, quizzes */
  useEffect(() => {
    let dead = false;
    setEvError(false);
    eventsApi.list(setupId)
      .then((l) => { if (!dead) setEvents(l.map(normEv).filter((e) => e.start)); })
      .catch(() => { if (!dead) setEvError(true); });
    return () => { dead = true; };
  }, [setupId]);

  const eventsOn = useCallback((d) => events.filter((e) => e.start <= d && e.end >= d), [events]);
  const classesOn = (d) => cur?.days?.[d] || [];

  /* month totals (only days inside the month, cancelled classes left out) */
  const stats = useMemo(() => {
    const s = { classes: 0, present: 0, absent: 0, upcoming: 0 };
    grid.forEach((d) => {
      if (d.slice(0, 7) !== mk) return;
      (cur?.days?.[d] || []).forEach((c) => {
        if (c.status === "cancelled" || c.status === "not_counted") return;
        s.classes++;
        if (c.status === "present") s.present++;
        else if (c.status === "absent") s.absent++;
        else if (c.status === "pending" && d >= today) s.upcoming++;
      });
    });
    return s;
  }, [grid, mk, cur, today]);

  /* navigation */
  const select = (d, focus) => {
    setSelected(d);
    const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1;
    if (y !== cursor.y || m !== cursor.m) setCursor({ y, m });
    if (focus) focusNext.current = d;
  };
  const goMonth = (n) => {
    const next = shiftMonth(cursor.y, cursor.m, n);
    setCursor(next);
    setSelected(monthKey(next.y, next.m) === today.slice(0, 7) ? today : `${monthKey(next.y, next.m)}-01`);
  };
  const goToday = () => select(today);

  useEffect(() => {
    if (!focusNext.current) return;
    gridRef.current?.querySelector(`[data-date="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  }, [selected, cursor]);

  const onKey = (e) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    select(addDays(selected, delta), true);
  };
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goMonth(dx < 0 ? 1 : -1);
  };

  /* selected day */
  const dayClasses = classesOn(selected);
  const dayEvents = eventsOn(selected);
  const rel = selected === today ? "Today" : selected === addDays(today, 1) ? "Tomorrow" : selected === addDays(today, -1) ? "Yesterday" : at(F_WEEKDAY, selected);
  const loading = cur?.status === "loading";
  const failed = cur?.status === "error";
  const onToday = selected === today;
  const statsLoading = loading && !cur?.days?.[grid[0]];

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 min-[380px]:px-3.5 sm:px-6 sm:py-10 xl:max-w-7xl">
      <style>{CSS}</style>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[color:var(--ink)] sm:text-[32px]">Calendar</h1>
          <p className="mt-0.5 truncate text-[13.5px] text-[color:var(--muted)]">{setup.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <GlassBtn aria-label="Previous month" onClick={() => goMonth(-1)} className="h-11 w-11"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></GlassBtn>
          <GlassBtn onClick={goToday} disabled={onToday && mk === today.slice(0, 7)} className="h-11 gap-1.5 px-4 text-[13.5px] font-semibold">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />Today
          </GlassBtn>
          <GlassBtn aria-label="Next month" onClick={() => goMonth(1)} className="h-11 w-11"><ChevronRight className="h-5 w-5" aria-hidden="true" /></GlassBtn>
        </div>
      </header>

      <Alert type="error" className="mb-4">{failed ? cur.message : ""}</Alert>
      {evError && (
        <p className="mb-4 inline-flex items-start gap-1.5 text-[12.5px] text-amber-700">
          <BellRing className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">Couldn't load holidays and events, so only classes are shown.</span>
        </p>
      )}

      <div className="grid items-start gap-2.5 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------------- month ---------------- */}
        <Panel className="@container">
          {loading && (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-[color:var(--track)]">
              <span className="cal-bar block h-full w-1/4 rounded-full bg-[#4F46E5]" />
            </span>
          )}
          <div className="p-3.5 min-[380px]:p-4 sm:p-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "pan-y" }}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--ink)] sm:text-[22px]" aria-live="polite">{at(F_MONTH, `${mk}-01`)}</h2>
              <p className="text-[12px] text-[color:var(--muted)]">Swipe or use arrow keys to move around</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 @lg:grid-cols-4">
              <Tile label="Classes" value={stats.classes} loading={statsLoading} />
              <Tile label="Present" value={stats.present} tone="text-emerald-700" loading={statsLoading} />
              <Tile label="Absent" value={stats.absent} tone="text-[#A32A42]" loading={statsLoading} />
              <Tile label="Upcoming" value={stats.upcoming} tone="text-indigo-600" loading={statsLoading} />
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 @2xl:gap-1.5" aria-hidden="true">
              {WEEK.map((w) => (
                <span key={w} className="py-1 text-center text-[12px] font-medium text-[color:var(--body)]">{w}</span>
              ))}
            </div>

            <div
              key={mk}
              ref={gridRef}
              role="group"
              aria-label={`Days of ${at(F_MONTH, `${mk}-01`)}`}
              onKeyDown={onKey}
              className="cal-in mt-1 grid grid-cols-7 gap-1 @2xl:gap-1.5"
            >
              {grid.map((d) => (
                <Cell
                  key={d}
                  date={d}
                  inMonth={d.slice(0, 7) === mk}
                  selected={d === selected}
                  isToday={d === today}
                  classes={classesOn(d)}
                  events={eventsOn(d)}
                  tabIndex={d === selected ? 0 : -1}
                  onPick={(x) => select(x)}
                />
              ))}
            </div>

            {/* legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--line-soft)] pt-3 text-[12px] text-[color:var(--muted)]">
              {[["Present", "#10B981"], ["Absent", "#F43F5E"], ["Excused", "#0EA5E9"], ["Cancelled", "#9AA0B5"]].map(([l, c]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px #4F46E5" }} />Upcoming</span>
              {["holiday", "exam", "quiz"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><span className={cx("h-1.5 w-3.5 rounded-full", EV[t].bar)} />{EV[t].label}</span>
              ))}
            </div>
          </div>
        </Panel>

        {/* ---------------- selected day ---------------- */}
        <Panel className="lg:sticky lg:top-6">
          <div key={selected} className="cal-in p-3.5 min-[380px]:p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[color:var(--ink)]">{rel}</h2>
                <p className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">{at(F_LONG, selected)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-[color:var(--line)] bg-[color:var(--inset)] px-3 py-1 text-[12px] font-semibold text-[color:var(--ink)] tabular-nums">
                {loading && !cur?.days?.[selected] ? "…" : `${dayClasses.length} ${dayClasses.length === 1 ? "class" : "classes"}`}
              </span>
            </div>

            {dayEvents.length > 0 && (
              <div className="mt-3 space-y-2">
                {dayEvents.map((e) => (
                  <div key={e.id} className={cx("flex items-start gap-2.5 rounded-xl border px-3 py-2 text-[13px]", evTone(e).card, e.draft && "border-dashed")}>
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <b className="font-semibold">{e.title}</b>{" "}
                      <span className="opacity-90">({evTone(e).label}{e.draft ? ", draft" : ""})</span>
                      {e.start !== e.end && (
                        <span className="block opacity-90">
                          {at(F_LONG, e.start).replace(/ \d{4}$/, "")} to {at(F_LONG, e.end).replace(/ \d{4}$/, "")}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3" aria-live="polite">
              {failed && !cur?.days?.[selected] ? (
                <div className="rounded-xl bg-[color:var(--inset)] px-4 py-6 text-center">
                  <p className="text-[14.5px] font-semibold text-[color:var(--ink)]">Couldn't load this month</p>
                  <p className="mt-1 text-[13px] text-[color:var(--muted)]">Check your connection and try again.</p>
                  <button
                    type="button"
                    onClick={() => loadMonth(cacheKey, grid)}
                    className={cx("mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl px-5 text-[13.5px] font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] transition-colors active:scale-[0.98] motion-reduce:transition-none", FOCUS)}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
                  </button>
                </div>
              ) : loading && !cur?.days?.[selected] ? (
                <ul className="space-y-2" aria-busy="true" aria-label="Loading classes">
                  {[0, 1, 2].map((i) => <li key={i} className="h-[64px] animate-pulse rounded-xl bg-[color:var(--line-soft)] motion-reduce:animate-none" style={{ opacity: 1 - i * 0.2 }} />)}
                </ul>
              ) : dayClasses.length ? (
                <ul className="space-y-2">
                  {dayClasses.map((c) => {
                    const st = statusFor(c, selected, today);
                    const cancelled = c.status === "cancelled";
                    return (
                      <li key={c.id} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-xl bg-[color:var(--inset)] py-2.5 pl-5 pr-3">
                        <span aria-hidden="true" className="absolute inset-y-2.5 left-2 w-1 rounded-full" style={{ background: c.color || "#4F46E5" }} />
                        <div className="text-[12px] leading-tight tabular-nums text-[color:var(--muted)]">
                          <span className="block text-[14px] font-semibold text-[color:var(--ink)]">{c.start}</span>{c.end}
                        </div>
                        <div className="min-w-0">
                          <p className={cx("truncate text-[14.5px] font-semibold text-[color:var(--ink)]", cancelled && "line-through opacity-60")}>{c.name || c.code}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12.5px] capitalize text-[color:var(--muted)]">
                            {c.type && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{c.type}</span>}
                            {c.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{c.room}</span>}
                          </p>
                        </div>
                        <span className={cx("col-start-2 inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[12px] font-medium", st.pill)}>{st.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-xl bg-[color:var(--inset)] px-4 py-8 text-center">
                  <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-[14.5px] font-semibold text-[color:var(--ink)]">{dayEvents.some((e) => e.type === "holiday") ? "Holiday" : "No classes"}</p>
                  <p className="mt-1 text-[13px] text-[color:var(--muted)]">{dayEvents.some((e) => e.type === "holiday") ? "Enjoy the break." : "Enjoy the free day."}</p>
                </div>
              )}
            </div>

            <p className="mt-3 px-1 text-[12px] text-[color:var(--muted)]">Mark attendance for today from the Home page.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}