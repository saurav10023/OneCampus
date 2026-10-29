import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { eventsApi, occurrencesApi, errMsg, toDateInput } from "../api/endpoints";
import { normOcc } from "../api/home";
import { Alert, cx } from "../components/Ui";

/* ------------------------------------------------------------------ *
 *  Calendar: month grid + day detail, liquid-glass styling.
 *  Route it inside the same layout as Attendance (it reads `setup`
 *  from the outlet context), e.g. <Route path="calendar" element={<Calendar />} />
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

/* ---------- look-up tables ---------- */
const STATUS = {
  present: { label: "Present", pill: "bg-emerald-500/15 text-emerald-800 border-emerald-400/50" },
  absent: { label: "Absent", pill: "bg-rose-500/15 text-rose-800 border-rose-400/50" },
  excused: { label: "Excused", pill: "bg-sky-500/15 text-sky-800 border-sky-400/50" },
  cancelled: { label: "Cancelled", pill: "bg-slate-500/15 text-slate-700 border-slate-400/50" },
  not_counted: { label: "Not counted", pill: "bg-amber-400/20 text-amber-900 border-amber-400/50" },
  pending: { label: "Upcoming", pill: "bg-indigo-500/12 text-indigo-800 border-indigo-400/40" },
  unmarked: { label: "Not marked", pill: "bg-amber-400/20 text-amber-900 border-amber-400/50" },
};
const DOT = { present: "#10B981", absent: "#F43F5E", excused: "#0EA5E9", cancelled: "#94A3B8", not_counted: "#F59E0B" };
const statusFor = (c, date, today) => (c.status === "pending" ? (date < today ? STATUS.unmarked : STATUS.pending) : STATUS[c.status] || STATUS.pending);

const EV = {
  holiday: { label: "Holiday", bar: "bg-amber-400", soft: "bg-amber-400/25 text-amber-900", card: "border-amber-300/70 bg-amber-300/20 text-amber-900" },
  exam: { label: "Exam", bar: "bg-rose-400", soft: "bg-rose-400/25 text-rose-900", card: "border-rose-300/70 bg-rose-300/20 text-rose-900" },
  quiz: { label: "Quiz", bar: "bg-sky-400", soft: "bg-sky-400/25 text-sky-900", card: "border-sky-300/70 bg-sky-300/20 text-sky-900" },
  other: { label: "Event", bar: "bg-violet-400", soft: "bg-violet-400/25 text-violet-900", card: "border-violet-300/70 bg-violet-300/20 text-violet-900" },
};
const evTone = (e) => EV[e.type] || EV.other;

/* ---------- glass bits ---------- */
const SEL = "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-white/40 shadow-[0_14px_30px_-10px_rgba(91,82,238,.75),inset_0_1px_0_rgba(255,255,255,.55)]";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

const Panel = ({ className, children }) => (
  <section className={cx(
    "relative overflow-hidden rounded-[28px] border border-white/70 bg-white/30 backdrop-blur-2xl backdrop-saturate-[1.7]",
    "shadow-[inset_0_1.5px_0_rgba(255,255,255,.95),inset_0_-1px_0_rgba(255,255,255,.3),inset_0_0_44px_rgba(255,255,255,.28),0_30px_60px_-30px_rgba(43,50,120,.45)]",
    className)}>
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_0%_0%,rgba(255,255,255,.65),transparent_55%)]" />
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
    <div className="relative">{children}</div>
  </section>
);

const GlassBtn = ({ className, ...p }) => (
  <button type="button" {...p}
    className={cx("inline-flex items-center justify-center rounded-full border border-white/70 bg-white/45 backdrop-blur-xl text-[#161827] shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_8px_20px_-10px_rgba(43,50,120,.45)] transition hover:bg-white/75 active:scale-95 disabled:opacity-40 disabled:pointer-events-none motion-reduce:transition-none", FOCUS, className)} />
);

const Dot = ({ c, onDark }) => {
  const base = DOT[c.status];
  const col = c.color || "#5B52EE";
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
    <button type="button" data-date={date} tabIndex={tabIndex} aria-pressed={selected} aria-label={label} onClick={() => onPick(date)}
      className={cx(
        "group relative flex min-h-[58px] flex-col rounded-2xl border p-1.5 text-left transition duration-200 active:scale-[.97] sm:min-h-[104px] sm:p-2 motion-reduce:transition-none motion-reduce:active:scale-100",
        FOCUS,
        selected ? SEL : "border-white/60 bg-white/25 hover:-translate-y-0.5 hover:bg-white/60 hover:shadow-lg hover:shadow-indigo-500/10",
        !inMonth && !selected && "opacity-45")}>
      <span className="flex items-start justify-between">
        <span className={cx("inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-semibold tabular-nums",
          isToday ? (selected ? "bg-white/25 text-white" : "bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] text-white shadow-sm shadow-indigo-500/40") : selected ? "text-white" : "text-[#161827]")}>
          {Number(date.slice(8))}
        </span>
        {classes.length > 0 && (
          <span className={cx("hidden text-[10.5px] font-medium tabular-nums sm:inline", selected ? "text-white/80" : "text-[#6A6F85]")}>{classes.length}</span>
        )}
      </span>

      {/* desktop: class chips */}
      <span className="mt-1 hidden flex-col gap-1 sm:flex">
        {shown.map((c) => (
          <span key={c.id} className={cx("flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-[10.5px] font-medium leading-tight", selected ? "text-white" : "text-[#161827]", c.status === "cancelled" && "line-through opacity-60")}
            style={{ background: selected ? "rgba(255,255,255,.2)" : `color-mix(in srgb, ${c.color || "#5B52EE"} 16%, transparent)` }}>
            <Dot c={c} onDark={selected} />
            <span className="truncate">{c.start} {c.code || c.name}</span>
          </span>
        ))}
        {more > 0 && <span className={cx("px-1 text-[10.5px] font-medium", selected ? "text-white/80" : "text-[#6A6F85]")}>+{more} more</span>}
      </span>

      {/* phones: dots */}
      <span className="mt-auto flex flex-wrap gap-[3px] pt-1 sm:hidden">
        {classes.slice(0, 5).map((c) => <Dot key={c.id} c={c} onDark={selected} />)}
      </span>

      {ev && (
        <>
          <span aria-hidden="true" className={cx("mt-1 h-1 rounded-full sm:hidden", selected ? "bg-white/80" : evTone(ev).bar)} />
          <span className={cx("mt-auto hidden truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:block", selected ? "bg-white/25 text-white" : evTone(ev).soft, ev.draft && "border border-dashed border-current/40")}>
            {ev.title}{events.length > 1 ? ` +${events.length - 1}` : ""}
          </span>
        </>
      )}
    </button>
  );
};

const Tile = ({ label, value, tone, loading }) => (
  <div className="rounded-2xl border border-white/70 bg-white/40 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
    <p className="text-[11.5px] text-[#6A6F85]">{label}</p>
    <p className={cx("text-[20px] font-semibold leading-tight tabular-nums", tone || "text-[#161827]")}>
      {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded-md bg-[#161827]/10 align-middle motion-reduce:animate-none" /> : value}
    </p>
  </div>
);

const CSS = `
@keyframes cal-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes cal-bar{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
.cal-in{animation:cal-in .35s cubic-bezier(.2,.8,.2,1) both}
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

  return (
    <div className="relative isolate mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <style>{CSS}</style>

      {/* ambient light the glass refracts */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[560px] overflow-hidden">
        <span className="absolute -left-16 top-6 h-72 w-72 rounded-full bg-[#5B52EE]/30 blur-3xl" />
        <span className="absolute right-0 top-28 h-80 w-80 rounded-full bg-[#2B8DE0]/30 blur-3xl" />
        <span className="absolute left-1/3 top-64 h-64 w-64 rounded-full bg-fuchsia-300/30 blur-3xl" />
      </div>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#161827] sm:text-[30px]">Calendar</h1>
          <p className="mt-0.5 truncate text-[13.5px] text-[#6A6F85]">{setup.name}</p>
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
        <p className="mb-4 inline-flex items-start gap-1.5 text-[12.5px] text-amber-800">
          <BellRing className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />Couldn't load holidays and events, so only classes are shown.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------------- month ---------------- */}
        <Panel>
          {loading && (
            <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
              <span className="cal-bar block h-full w-1/4 rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" />
            </span>
          )}
          <div className="p-3.5 sm:p-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "pan-y" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[20px] font-semibold tracking-tight text-[#161827] sm:text-[22px]" aria-live="polite">{at(F_MONTH, `${mk}-01`)}</h2>
              <p className="text-[12px] text-[#6A6F85]">Swipe or use arrow keys to move around</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Tile label="Classes" value={stats.classes} loading={loading && !cur?.days?.[grid[0]]} />
              <Tile label="Present" value={stats.present} tone="text-emerald-600" loading={loading && !cur?.days?.[grid[0]]} />
              <Tile label="Absent" value={stats.absent} tone="text-rose-600" loading={loading && !cur?.days?.[grid[0]]} />
              <Tile label="Upcoming" value={stats.upcoming} tone="text-indigo-600" loading={loading && !cur?.days?.[grid[0]]} />
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden="true">
              {WEEK.map((w, i) => (
                <span key={w} className={cx("py-1 text-center text-[11px] font-semibold uppercase tracking-wide sm:text-[11.5px]", i > 4 ? "text-[#6A6F85]/70" : "text-[#6A6F85]")}>{w}</span>
              ))}
            </div>

            <div key={mk} ref={gridRef} role="group" aria-label={`Days of ${at(F_MONTH, `${mk}-01`)}`} onKeyDown={onKey} className="cal-in mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
              {grid.map((d) => (
                <Cell key={d} date={d} inMonth={d.slice(0, 7) === mk} selected={d === selected} isToday={d === today}
                  classes={classesOn(d)} events={eventsOn(d)} tabIndex={d === selected ? 0 : -1} onPick={(x) => select(x)} />
              ))}
            </div>

            {/* legend */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[#6A6F85]">
              {[["Present", "#10B981"], ["Absent", "#F43F5E"], ["Excused", "#0EA5E9"], ["Cancelled", "#94A3B8"]].map(([l, c]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px #5B52EE" }} />Upcoming</span>
              <span className="hidden h-3 w-px bg-[#161827]/15 sm:block" />
              {["holiday", "exam", "quiz"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><span className={cx("h-1.5 w-3.5 rounded-full", EV[t].bar)} />{EV[t].label}</span>
              ))}
            </div>
          </div>
        </Panel>

        {/* ---------------- selected day ---------------- */}
        <Panel className="lg:sticky lg:top-6">
          <div key={selected} className="cal-in p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#161827]">{rel}</h2>
                <p className="mt-0.5 text-[12.5px] text-[#6A6F85]">{at(F_LONG, selected)}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/70 bg-white/50 px-3 py-1 text-[12px] font-semibold text-[#161827] shadow-[inset_0_1px_0_rgba(255,255,255,.9)]">
                {loading && !cur?.days?.[selected] ? "…" : `${dayClasses.length} ${dayClasses.length === 1 ? "class" : "classes"}`}
              </span>
            </div>

            {dayEvents.length > 0 && (
              <div className="mt-3 space-y-2">
                {dayEvents.map((e) => (
                  <div key={e.id} className={cx("flex items-start gap-2.5 rounded-2xl border px-3 py-2 text-[12.5px] backdrop-blur", evTone(e).card, e.draft && "border-dashed")}>
                    <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span><b className="font-semibold">{e.title}</b> <span className="opacity-80">({evTone(e).label}{e.draft ? ", draft" : ""})</span>
                      {e.start !== e.end && <span className="block opacity-80">{at(F_LONG, e.start).replace(/ \d{4}$/, "")} to {at(F_LONG, e.end).replace(/ \d{4}$/, "")}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3" aria-live="polite">
              {failed && !cur?.days?.[selected] ? (
                <div className="rounded-2xl border border-white/70 bg-white/40 px-4 py-6 text-center">
                  <p className="text-[14.5px] font-semibold text-[#161827]">Couldn't load this month</p>
                  <p className="mt-1 text-[13px] text-[#6A6F85]">Check your connection and try again.</p>
                  <button type="button" onClick={() => loadMonth(cacheKey, grid)}
                    className={cx("mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold", SEL, FOCUS)}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
                  </button>
                </div>
              ) : loading && !cur?.days?.[selected] ? (
                <ul className="space-y-2" aria-busy="true" aria-label="Loading classes">
                  {[0, 1, 2].map((i) => <li key={i} className="h-[64px] animate-pulse rounded-2xl border border-white/60 bg-white/40 motion-reduce:animate-none" style={{ opacity: 1 - i * 0.2 }} />)}
                </ul>
              ) : dayClasses.length ? (
                <ul className="space-y-2">
                  {dayClasses.map((c) => {
                    const st = statusFor(c, selected, today);
                    const cancelled = c.status === "cancelled";
                    return (
                      <li key={c.id} className="relative grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-2xl border border-white/70 bg-white/45 py-2.5 pl-5 pr-3 shadow-[inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-xl">
                        <span aria-hidden="true" className="absolute inset-y-2.5 left-2 w-1 rounded-full" style={{ background: c.color || "#5B52EE" }} />
                        <div className="text-[11.5px] leading-tight tabular-nums text-[#6A6F85]">
                          <span className="flex items-center gap-1 text-[13.5px] font-semibold text-[#161827]">{c.start}</span>{c.end}
                        </div>
                        <div className="min-w-0">
                          <p className={cx("truncate text-[14px] font-semibold text-[#161827]", cancelled && "line-through opacity-60")}>{c.name || c.code}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] capitalize text-[#6A6F85]">
                            {c.type && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{c.type}</span>}
                            {c.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{c.room}</span>}
                          </p>
                        </div>
                        <span className={cx("col-start-2 inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[11.5px] font-medium", st.pill)}>{st.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl border border-white/70 bg-white/40 px-4 py-8 text-center">
                  <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#5B52EE]/15 to-[#2B8DE0]/15 text-indigo-600">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="text-[14.5px] font-semibold text-[#161827]">{dayEvents.some((e) => e.type === "holiday") ? "Holiday" : "No classes"}</p>
                  <p className="mt-1 text-[13px] text-[#6A6F85]">{dayEvents.some((e) => e.type === "holiday") ? "Enjoy the break." : "Enjoy the free day."}</p>
                </div>
              )}
            </div>

            <p className="mt-3 px-1 text-[11.5px] text-[#6A6F85]">Mark attendance for today from the Home page.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}