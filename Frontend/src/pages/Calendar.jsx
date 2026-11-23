import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import {
  AlertCircle, Ban, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, ClipboardList,
  Clock, GraduationCap, MapPin, RefreshCw, ShieldCheck, Sparkles, Sun, X, XCircle,
} from "lucide-react";
import { eventsApi, occurrencesApi, errMsg, toDateInput } from "../api/endpoints";
import { normOcc } from "../api/home";
import { cx } from "../components/Ui";

/* ------------------------------------------------------------------ *
 *  Calendar: just the month grid. Tap a day to open a pop-up with that
 *  day's events and classes (bottom sheet on phones, centred on desktop).
 *  Route it inside the same layout as Attendance (it reads `setup`
 *  from the outlet context).
 *
 *  Grid layout uses container queries (@xl: / @2xl:):
 *    narrow : day number, class dots, event icon, tinted day, event bar
 *    medium : + class count and event name
 *    wide   : + class chips with time and subject
 * ------------------------------------------------------------------ */

/* ---------- date helpers (YYYY-MM-DD strings, UTC math) ---------- */
const DAY = 86400000;
const toUtc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (iso, n) => fromUtc(toUtc(iso) + n * DAY);
const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY);
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
const F_DM = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const F_ARIA = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const at = (f, iso) => f.format(new Date(toUtc(iso)));
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
const rangeText = (e) => (e.start === e.end ? at(F_DM, e.start) : `${at(F_DM, e.start)} – ${at(F_DM, e.end)}`);
const lengthText = (e) => { const n = diffDays(e.start, e.end) + 1; return n > 1 ? plural(n, "day", "days") : "1 day"; };

/* ---------- look-up tables (every status has an icon and a text label) ---------- */
const STATUS = {
  present: { label: "Present", icon: CheckCircle2, pill: "bg-emerald-50 text-emerald-800 border-emerald-300" },
  absent: { label: "Absent", icon: XCircle, pill: "bg-rose-50 text-[#9F1239] border-rose-300" },
  excused: { label: "Excused", icon: ShieldCheck, pill: "bg-sky-50 text-sky-800 border-sky-300" },
  cancelled: { label: "Cancelled", icon: Ban, pill: "bg-[color:var(--surface)] text-[color:var(--body)] border-[color:var(--line-strong)]" },
  not_counted: { label: "Not counted", icon: CircleDashed, pill: "bg-amber-50 text-amber-900 border-amber-300" },
  pending: { label: "Upcoming", icon: Clock, pill: "bg-indigo-50 text-indigo-800 border-indigo-300" },
  unmarked: { label: "Not marked", icon: AlertCircle, pill: "bg-amber-50 text-amber-900 border-amber-300" },
};
const DOT = { present: "#10B981", absent: "#F43F5E", excused: "#0EA5E9", cancelled: "#9AA0B5", not_counted: "#F59E0B" };
const statusFor = (c, date, today) => (c.status === "pending" ? (date < today ? STATUS.unmarked : STATUS.pending) : STATUS[c.status] || STATUS.pending);

const EV = {
  holiday: { label: "Holiday", icon: Sun, ink: "text-amber-700", bar: "bg-amber-500", edge: "bg-amber-500", soft: "bg-amber-100 text-amber-900", card: "border-amber-300 bg-amber-50 text-amber-900", tint: "border-amber-300 bg-amber-50" },
  exam: { label: "Exam", icon: GraduationCap, ink: "text-rose-700", bar: "bg-rose-500", edge: "bg-rose-500", soft: "bg-rose-100 text-[#9F1239]", card: "border-rose-300 bg-rose-50 text-[#9F1239]", tint: "border-rose-300 bg-rose-50" },
  quiz: { label: "Quiz", icon: ClipboardList, ink: "text-sky-700", bar: "bg-sky-500", edge: "bg-sky-500", soft: "bg-sky-100 text-sky-900", card: "border-sky-300 bg-sky-50 text-sky-900", tint: "border-sky-300 bg-sky-50" },
  other: { label: "Event", icon: Sparkles, ink: "text-violet-700", bar: "bg-violet-500", edge: "bg-violet-500", soft: "bg-violet-100 text-violet-900", card: "border-violet-300 bg-violet-50 text-violet-900", tint: "border-violet-300 bg-violet-50" },
};
const evTone = (e) => EV[e.type] || EV.other;

/* ---------- shared bits ---------- */
const SEL = "bg-[#4F46E5] border-[#4F46E5] text-white";
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]";

const GlassBtn = ({ className, ...p }) => (
  <button
    type="button"
    {...p}
    className={cx(
      "inline-flex items-center justify-center rounded-xl border border-[color:var(--line-strong)] bg-[color:var(--surface)] text-[color:var(--ink)] transition-colors",
      "hover:bg-[color:var(--inset)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
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
    : { background: "transparent", boxShadow: `inset 0 0 0 1.75px ${onDark ? "rgba(255,255,255,.95)" : col}` };
  return <span className={cx("h-2 w-2 shrink-0 rounded-full", base && onDark && "ring-1 ring-white/80")} style={style} />;
};

/* ---------- one day cell ---------- */
const Cell = ({ date, inMonth, selected, isToday, classes, events, tabIndex, onPick }) => {
  const ev = events[0];
  const tone = ev ? evTone(ev) : null;
  const EvIcon = tone?.icon;
  const weekend = dowMon(date) >= 5;

  const limit = events.length ? 2 : 3;
  const shown = classes.slice(0, limit);
  const more = classes.length - shown.length;
  const strips = events.slice(0, classes.length ? 1 : 2);
  const hiddenEvents = events.length - strips.length;

  const label = `${at(F_ARIA, date)}${isToday ? ", today" : ""}, ${classes.length === 0 ? "no classes" : plural(classes.length, "class", "classes")}${events.length ? `, ${events.map((e) => `${e.title} (${evTone(e).label})`).join(", ")}` : ""}`;

  return (
    <button
      type="button"
      data-date={date}
      tabIndex={tabIndex}
      aria-haspopup="dialog"
      aria-label={label}
      aria-current={isToday ? "date" : undefined}
      onClick={() => onPick(date)}
      className={cx(
        "relative flex min-h-[64px] min-w-0 flex-col overflow-hidden rounded-xl border p-1.5 text-left transition-colors active:scale-[0.97]",
        "@xl:min-h-[100px] @xl:p-2 @2xl:min-h-[140px] motion-reduce:transition-none motion-reduce:active:scale-100",
        FOCUS,
        isToday && !selected && "ring-2 ring-[#4F46E5] ring-offset-1 ring-offset-[color:var(--surface)]",
        selected
          ? SEL
          : inMonth
          ? cx(ev ? tone.tint : cx("border-[color:var(--line)]", weekend ? "bg-[color:var(--inset)]" : "bg-[color:var(--surface)]"), "hover:border-[#4F46E5]/60")
          : "border-transparent bg-[color:var(--inset)] opacity-55 hover:border-[color:var(--line)] hover:opacity-100"
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={cx(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[13px] font-bold tabular-nums @xl:h-7 @xl:min-w-7 @xl:text-[14px]",
            isToday
              ? selected ? "bg-white text-[#4F46E5]" : "bg-[#4F46E5] text-white"
              : selected ? "text-white" : "text-[color:var(--ink)]"
          )}
        >
          {Number(date.slice(8))}
        </span>

        {EvIcon && <EvIcon className={cx("mt-1 h-4 w-4 shrink-0 @xl:hidden", selected ? "text-white" : tone.ink)} aria-hidden="true" />}

        {classes.length > 0 && (
          <span
            className={cx(
              "mt-0.5 hidden h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums @xl:inline-flex",
              selected ? "bg-white/25 text-white" : "border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)]"
            )}
            title={plural(classes.length, "class", "classes")}
          >
            {classes.length}
          </span>
        )}
      </span>

      {/* wide: class chips */}
      <span className="mt-1.5 hidden min-w-0 flex-col gap-1 @2xl:flex">
        {shown.map((c) => (
          <span
            key={c.id}
            className={cx(
              "flex min-w-0 items-center gap-1.5 rounded-md border-l-[3px] px-1.5 py-[3px] text-[12px] font-medium leading-tight",
              selected ? "bg-white/20 text-white" : "border-y border-r border-y-[color:var(--line-soft)] border-r-[color:var(--line-soft)] bg-[color:var(--surface)] text-[color:var(--ink)]",
              c.status === "cancelled" && "line-through opacity-70"
            )}
            style={{ borderLeftColor: c.color || "#4F46E5" }}
          >
            <Dot c={c} onDark={selected} />
            <span className="truncate"><span className="font-semibold tabular-nums">{c.start}</span> {c.code || c.name}</span>
          </span>
        ))}
        {more > 0 && <span className={cx("px-1 text-[12px] font-semibold", selected ? "text-white/90" : "text-[color:var(--body)]")}>+{more} more</span>}
      </span>

      {/* narrow and medium: class dots */}
      <span className="mt-auto flex flex-wrap gap-1 pt-1 @2xl:hidden">
        {classes.slice(0, 6).map((c) => <Dot key={c.id} c={c} onDark={selected} />)}
        {classes.length > 6 && <span className={cx("text-[11px] font-bold leading-none", selected ? "text-white/90" : "text-[color:var(--body)]")}>+{classes.length - 6}</span>}
      </span>

      {/* narrow: coloured bar */}
      {ev && <span aria-hidden="true" className={cx("mt-1 h-1.5 rounded-full @xl:hidden", selected ? "bg-white/80" : tone.bar)} />}

      {/* medium and wide: event strip with name; multi-day events read as one band */}
      {events.length > 0 && (
        <span className={cx("mt-1 hidden min-w-0 flex-col gap-1 @xl:flex", classes.length === 0 && "mt-auto")}>
          {strips.map((e, i) => {
            const t = evTone(e);
            const Icon = t.icon;
            const starts = e.start === date;
            const ends = e.end === date;
            const showTitle = starts || dowMon(date) === 0 || date.slice(8) === "01";
            return (
              <span
                key={e.id}
                className={cx(
                  "flex h-5 min-w-0 items-center gap-1 px-1.5 text-[11px] font-bold leading-none @2xl:h-[22px] @2xl:text-[12px]",
                  selected ? "bg-white/25 text-white" : t.soft,
                  starts ? "rounded-l-md" : "-ml-1.5 rounded-l-none pl-3 @2xl:-ml-2",
                  ends ? "rounded-r-md" : "-mr-1.5 rounded-r-none @2xl:-mr-2",
                  e.draft && "border border-dashed border-current/50"
                )}
              >
                {showTitle ? (
                  <>
                    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{e.title}</span>
                    {i === strips.length - 1 && hiddenEvents > 0 && <span className="shrink-0 opacity-90">+{hiddenEvents}</span>}
                  </>
                ) : (
                  <span aria-hidden="true" className="block h-full w-full" />
                )}
              </span>
            );
          })}
        </span>
      )}
    </button>
  );
};

/* ---------- pop-up cards ---------- */
const EventCard = ({ e }) => {
  const t = evTone(e);
  const Icon = t.icon;
  return (
    <div className={cx("relative flex items-start gap-3 overflow-hidden rounded-xl border py-2.5 pl-4 pr-3", t.card, e.draft && "border-dashed")}>
      <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-1.5", t.edge)} />
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--surface)]/80">
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 break-words text-[15px] font-bold leading-snug">{e.title}</p>
          <span className="inline-flex h-5 items-center rounded-full border border-current/40 bg-[color:var(--surface)]/60 px-2 text-[12px] font-semibold">{t.label}{e.draft ? " (draft)" : ""}</span>
        </div>
        <p className="mt-0.5 text-[13px] font-medium tabular-nums opacity-90">
          {rangeText(e)}{e.start !== e.end ? ` · ${lengthText(e)}` : ""}
        </p>
      </div>
    </div>
  );
};

const ClassRow = ({ c, date, today }) => {
  const st = statusFor(c, date, today);
  const StIcon = st.icon;
  const cancelled = c.status === "cancelled";
  return (
    <li className="relative grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] py-3 pl-5 pr-3">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color || "#4F46E5" }} />
      <div className="rounded-lg bg-[color:var(--inset)] py-1 text-center text-[12.5px] leading-tight tabular-nums text-[color:var(--body)]">
        <span className="block text-[15px] font-bold text-[color:var(--ink)]">{c.start}</span>{c.end}
      </div>
      <div className="min-w-0">
        <p className={cx("break-words text-[15.5px] font-bold leading-snug text-[color:var(--ink)]", cancelled && "line-through opacity-60")}>{c.name || c.code}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] font-medium capitalize text-[color:var(--body)]">
          {c.type && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{c.type}</span>}
          {c.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{c.room}</span>}
        </p>
      </div>
      <span className={cx("col-start-2 inline-flex h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold", st.pill)}>
        <StIcon className="h-3.5 w-3.5" aria-hidden="true" />{st.label}
      </span>
    </li>
  );
};

/* ---------- the day pop-up ---------- */
// theme variables the pop-up needs; copied from the calendar because the pop-up is rendered on <body>
const THEME_VARS = ["--surface", "--inset", "--line", "--line-soft", "--line-strong", "--ink", "--body", "--muted", "--faint", "--track"];

const DayDialog = ({ anchor, date, today, classes, events, loading, failed, onRetry, onClose, onStep }) => {
  const closeRef = useRef(null);
  const themeStyle = useMemo(() => {
    const out = {};
    if (anchor.current) {
      const cs = getComputedStyle(anchor.current);
      THEME_VARS.forEach((v) => { const val = cs.getPropertyValue(v); if (val) out[v] = val; });
    }
    return out;
  }, [anchor]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); onStep(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onStep(1); }
    else if (e.key === "Tab") {
      // keep focus inside the dialog
      const nodes = e.currentTarget.querySelectorAll("button:not([disabled])");
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  const rel = date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : at(F_WEEKDAY, date);
  const hasHoliday = events.some((e) => e.type === "holiday");
  const summary = [classes.length ? plural(classes.length, "class", "classes") : null, events.length ? plural(events.length, "event", "events") : null].filter(Boolean).join(" · ");

  // portal to <body> with a very high z-index so no footer, nav bar or transformed parent can cover it
  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4" style={{ ...themeStyle, zIndex: 100000 }} onKeyDown={onKeyDown}>
      <div aria-hidden="true" onClick={onClose} className="cal-fade absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={at(F_ARIA, date)}
        className="cal-sheet relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[color:var(--line)] bg-[color:var(--surface)] shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-[24px] font-bold leading-tight tracking-tight text-[color:var(--ink)]">{rel}</h2>
            <p className="mt-0.5 text-[13.5px] font-medium text-[color:var(--body)]">
              {at(F_LONG, date)}{summary ? ` · ${summary}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <GlassBtn aria-label="Previous day" onClick={() => onStep(-1)} className="h-10 w-10"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></GlassBtn>
            <GlassBtn aria-label="Next day" onClick={() => onStep(1)} className="h-10 w-10"><ChevronRight className="h-4 w-4" aria-hidden="true" /></GlassBtn>
            <button
              ref={closeRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cx("ml-1 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ink)] text-[color:var(--surface)] transition-opacity hover:opacity-85 active:scale-[0.97] motion-reduce:transition-none", FOCUS)}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5" aria-live="polite">
          {events.map((e) => <EventCard key={e.id} e={e} />)}

          {failed && !classes.length ? (
            <div className="rounded-xl border border-dashed border-[color:var(--line-strong)] bg-[color:var(--inset)] px-4 py-6 text-center">
              <p className="text-[15px] font-bold text-[color:var(--ink)]">Couldn't load classes</p>
              <p className="mt-1 text-[13.5px] text-[color:var(--body)]">Check your connection and try again.</p>
              <button
                type="button"
                onClick={onRetry}
                className={cx("mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA] active:scale-[0.98] motion-reduce:transition-none", FOCUS)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
              </button>
            </div>
          ) : loading && !classes.length ? (
            <ul className="space-y-2" aria-busy="true" aria-label="Loading classes">
              {[0, 1].map((i) => <li key={i} className="h-[76px] animate-pulse rounded-xl bg-[color:var(--line-soft)] motion-reduce:animate-none" style={{ opacity: 1 - i * 0.25 }} />)}
            </ul>
          ) : classes.length ? (
            <ul className="space-y-2">{classes.map((c) => <ClassRow key={c.id} c={c} date={date} today={today} />)}</ul>
          ) : events.length ? null : (
            <div className="rounded-xl border border-dashed border-[color:var(--line-strong)] bg-[color:var(--inset)] px-4 py-8 text-center">
              <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                {hasHoliday ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
              </span>
              <p className="text-[15px] font-bold text-[color:var(--ink)]">No classes</p>
              <p className="mt-1 text-[13.5px] text-[color:var(--body)]">Nothing scheduled this day.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const CSS = `
@keyframes cal-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes cal-bar{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}
@keyframes cal-fade{from{opacity:0}to{opacity:1}}
@keyframes cal-sheet{from{opacity:0;transform:translateY(28px) scale(.98)}to{opacity:1;transform:none}}
.cal-in{animation:cal-in .3s cubic-bezier(0.32,0.72,0,1) both}
.cal-bar{animation:cal-bar 1.1s ease-in-out infinite}
.cal-fade{animation:cal-fade .18s ease-out both}
.cal-sheet{animation:cal-sheet .26s cubic-bezier(0.32,0.72,0,1) both}
@media (prefers-reduced-motion:reduce){.cal-in,.cal-bar,.cal-fade,.cal-sheet{animation:none}}
`;

/* ================================================================== */
export default function Calendar() {
  const { setup } = useOutletContext();
  const setupId = setup._id;
  const today = useMemo(() => todayIn(setup.timezone), [setup.timezone]);

  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState({}); // `${setupId}|${YYYY-MM}` -> { status, days, message }
  const [events, setEvents] = useState([]);
  const [evError, setEvError] = useState(false);

  const asked = useRef(new Set());
  const gridRef = useRef(null);
  const focusNext = useRef(null);
  const touch = useRef(null);
  const rootRef = useRef(null);

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
  const pick = (d) => { select(d); setOpen(true); };
  const close = () => { focusNext.current = selected; setOpen(false); };

  // give focus back to the day cell after keyboard moves and after the pop-up closes
  useEffect(() => {
    if (open || !focusNext.current) return;
    gridRef.current?.querySelector(`[data-date="${focusNext.current}"]`)?.focus();
    focusNext.current = null;
  }, [selected, cursor, open]);

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

  const loading = cur?.status === "loading";
  const failed = cur?.status === "error";
  const onToday = selected === today && mk === today.slice(0, 7);

  // the pop-up may step into a month that is not loaded yet; the cursor follows `selected`, so it loads too
  const dayClasses = classesOn(selected);
  const dayEvents = eventsOn(selected);

  return (
    <div className="mx-auto max-w-6xl px-2 py-3 min-[380px]:px-3 sm:px-6 sm:py-6 xl:max-w-7xl">
      <style>{CSS}</style>

      <section ref={rootRef} className="@container relative overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] shadow-[0_1px_2px_rgba(27,31,51,0.05),0_8px_24px_-12px_rgba(27,31,51,0.10)]">
        {loading && (
          <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1 overflow-hidden bg-[color:var(--track)]">
            <span className="cal-bar block h-full w-1/4 rounded-full bg-[#4F46E5]" />
          </span>
        )}

        <div className="p-2.5 min-[380px]:p-3 sm:p-5" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "pan-y" }}>
          {/* month bar */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-[22px] font-bold tracking-tight text-[color:var(--ink)] sm:text-[26px]" aria-live="polite">{at(F_MONTH, `${mk}-01`)}</h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <GlassBtn aria-label="Previous month" onClick={() => goMonth(-1)} className="h-10 w-10"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></GlassBtn>
              <GlassBtn onClick={goToday} disabled={onToday} className="h-10 gap-1.5 px-3.5 text-[14px] font-semibold">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />Today
              </GlassBtn>
              <GlassBtn aria-label="Next month" onClick={() => goMonth(1)} className="h-10 w-10"><ChevronRight className="h-5 w-5" aria-hidden="true" /></GlassBtn>
            </div>
          </div>

          {(failed || evError) && (
            <p role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
              <span className="min-w-0">{failed ? cur.message : "Couldn't load holidays and events."}</span>
              {failed && (
                <button type="button" onClick={() => loadMonth(cacheKey, grid)} className={cx("inline-flex items-center gap-1 rounded-md font-semibold underline underline-offset-2", FOCUS)}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Retry
                </button>
              )}
            </p>
          )}

          <div className="mt-3 grid grid-cols-7 gap-1 @xl:gap-1.5" aria-hidden="true">
            {WEEK.map((w, i) => (
              <span key={w} className={cx("py-1 text-center text-[12.5px] font-bold", i >= 5 ? "text-[color:var(--muted)]" : "text-[color:var(--body)]")}>{w}</span>
            ))}
          </div>

          <div
            key={mk}
            ref={gridRef}
            role="group"
            aria-label={`Days of ${at(F_MONTH, `${mk}-01`)}`}
            onKeyDown={onKey}
            className="cal-in mt-1 grid grid-cols-7 gap-1 @xl:gap-1.5"
          >
            {grid.map((d) => (
              <Cell
                key={d}
                date={d}
                inMonth={d.slice(0, 7) === mk}
                selected={open && d === selected}
                isToday={d === today}
                classes={classesOn(d)}
                events={eventsOn(d)}
                tabIndex={d === selected ? 0 : -1}
                onPick={pick}
              />
            ))}
          </div>
        </div>
      </section>

      {open && (
        <DayDialog
          anchor={rootRef}
          date={selected}
          today={today}
          classes={dayClasses}
          events={dayEvents}
          loading={loading}
          failed={failed}
          onRetry={() => loadMonth(cacheKey, grid)}
          onClose={close}
          onStep={(n) => select(addDays(selected, n))}
        />
      )}
    </div>
  );
}