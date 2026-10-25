import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Ban, CalendarClock, CalendarOff, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, Lock, PartyPopper, Sparkles, Sun } from "lucide-react";
import { asList, attendanceApi, errMsg, occurrencesApi } from "../api/endpoints";
import { STATUS_META, overallOf, plural, statusOf } from "../lib/attendance";
import { Alert, Badge, Button, Card, Modal, PageHeader, PageSpinner, ProgressBar, cx } from "../components/Ui";
import Ring from "../components/Ring";

/* ------------------------------------------------------------------------------------------
   Dates. All plain YYYY-MM-DD strings in the setup's time zone, never converted by the browser.
------------------------------------------------------------------------------------------ */

const DAY = 86400000;
const WINDOW = 14; // days shown in the slider
const ymd = (d) => (d ? String(d).slice(0, 10) : "");
const parse = (s) => new Date(`${s}T00:00:00Z`);
const shift = (s, n) => new Date(parse(s).getTime() + n * DAY).toISOString().slice(0, 10);
const fmt = (s, opts) => (s ? new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts }).format(parse(s)) : "");
const longDate = (s) => fmt(s, { weekday: "long", day: "numeric", month: "short" });
const shortDate = (s) => fmt(s, { weekday: "short", day: "numeric", month: "short" });
const weekdayShort = (s) => fmt(s, { weekday: "short" });
const dayNumber = (s) => parse(s).getUTCDate();
const rangeLabel = (a, b) => {
  const m1 = fmt(a, { month: "short" });
  const m2 = fmt(b, { month: "short" });
  const y = fmt(b, { year: "numeric" });
  return m1 === m2 ? `${m1} ${y}` : `${m1} - ${m2} ${y}`;
};

const toMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const untilText = (now, start) => {
  const d = toMin(start) - toMin(now);
  if (d <= 0) return "now";
  if (d < 60) return `in ${d} min`;
  return `in ${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ""}`;
};

/* ------------------------------------------------------------------------------------------
   What can happen to a class or a day, and how each one looks.
------------------------------------------------------------------------------------------ */

const KINDS = {
  mass_bunk: {
    label: "Mass bunk",
    icon: PartyPopper,
    box: "bg-gradient-to-r from-fuchsia-500/20 via-violet-500/10 to-transparent border-fuchsia-200 text-fuchsia-950",
    soft: "bg-fuchsia-500/[0.07] border-fuchsia-200",
    tile: "bg-fuchsia-500 text-white",
    chip: "bg-fuchsia-500/10 border-fuchsia-200 text-fuchsia-800",
    dot: "bg-fuchsia-500",
  },
  holiday: {
    label: "Holiday",
    icon: Sun,
    box: "bg-gradient-to-r from-amber-400/25 via-orange-400/10 to-transparent border-amber-200 text-amber-950",
    soft: "bg-amber-500/[0.07] border-amber-200",
    tile: "bg-amber-500 text-white",
    chip: "bg-amber-500/10 border-amber-200 text-amber-800",
    dot: "bg-amber-500",
  },
  calendar_event: {
    label: "Day off",
    icon: CalendarOff,
    box: "bg-gradient-to-r from-amber-400/25 via-orange-400/10 to-transparent border-amber-200 text-amber-950",
    soft: "bg-amber-500/[0.07] border-amber-200",
    tile: "bg-amber-500 text-white",
    chip: "bg-amber-500/10 border-amber-200 text-amber-800",
    dot: "bg-amber-500",
  },
  class_cancel: {
    label: "Class cancelled",
    icon: Ban,
    box: "bg-gradient-to-r from-rose-500/20 via-rose-400/10 to-transparent border-rose-200 text-rose-950",
    soft: "bg-rose-500/[0.07] border-rose-200",
    tile: "bg-rose-500 text-white",
    chip: "bg-rose-500/10 border-rose-200 text-rose-800",
    dot: "bg-rose-500",
  },
  exam: {
    label: "Exam",
    icon: GraduationCap,
    box: "bg-gradient-to-r from-indigo-500/20 via-indigo-400/10 to-transparent border-indigo-200 text-indigo-950",
    soft: "bg-indigo-500/[0.07] border-indigo-200",
    tile: "bg-indigo-600 text-white",
    chip: "bg-indigo-500/10 border-indigo-200 text-indigo-800",
    dot: "bg-indigo-500",
  },
  quiz: {
    label: "Quiz",
    icon: ClipboardList,
    box: "bg-gradient-to-r from-sky-500/20 via-sky-400/10 to-transparent border-sky-200 text-sky-950",
    soft: "bg-sky-500/[0.07] border-sky-200",
    tile: "bg-sky-500 text-white",
    chip: "bg-sky-500/10 border-sky-200 text-sky-800",
    dot: "bg-sky-500",
  },
  event: {
    label: "Event",
    icon: Sparkles,
    box: "bg-gradient-to-r from-teal-500/20 via-teal-400/10 to-transparent border-teal-200 text-teal-950",
    soft: "bg-teal-500/[0.07] border-teal-200",
    tile: "bg-teal-500 text-white",
    chip: "bg-teal-500/10 border-teal-200 text-teal-800",
    dot: "bg-teal-500",
  },
};

const EVENT_KIND = { holiday: "holiday", break: "holiday", exam: "exam", quiz: "quiz", event: "event" };
const SHORT = { mass_bunk: "Bunk", calendar_event: "Off", class_cancel: "Cancelled" };

// The server accepts only present / absent / excused from a student.
// "Cancelled" is never a student choice: it comes from a holiday, mass bunk or CR cancellation.
const STATUSES = [
  { key: "present", label: "Present", on: "bg-emerald-500 text-white border-emerald-500" },
  { key: "absent", label: "Absent", on: "bg-rose-500 text-white border-rose-500" },
  { key: "excused", label: "Excused", on: "bg-sky-500 text-white border-sky-500" },
];

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";
const GRADIENT = "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25";
const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// Banners for a day: calendar events from the server, plus mass bunks and class cancellations
// found on the classes themselves (those are not calendar events).
const buildBanners = (day) => {
  const out = [];

  for (const ev of day?.events || []) {
    const kind = EVENT_KIND[ev.type] || "event";
    const start = ymd(ev.startDate);
    const end = ymd(ev.endDate);
    const multi = end && start && end > start;
    out.push({
      key: `e-${ev._id || ev.id || ev.title}`,
      kind,
      title: ev.title || KINDS[kind].label,
      text: [multi ? `${shortDate(start)} to ${shortDate(end)}.` : "", ev.affectsClasses ? "Classes are cancelled." : kind === "quiz" || kind === "exam" ? "" : "Classes run as usual."]
        .filter(Boolean)
        .join(" "),
      chip: ev.affectsClasses ? "Classes off" : KINDS[kind].label,
    });
  }

  const groups = {};
  for (const c of day?.classes || []) {
    const t = c.cancelledBy?.type;
    if (t !== "mass_bunk" && t !== "class_cancel") continue;
    const g = (groups[t] ||= { kind: t, count: 0, reason: "", official: false });
    g.count += 1;
    g.reason ||= c.reason || "";
    g.official ||= c.lock === "official_cancellation";
  }
  for (const g of Object.values(groups)) {
    out.push({
      key: g.kind,
      kind: g.kind,
      title: g.kind === "mass_bunk" ? "Mass bunk" : "Class cancelled",
      text: [g.official ? "Announced by your CR." : "", g.reason ? (/[.!?]$/.test(g.reason) ? g.reason : `${g.reason}.`) : "", "Cancelled classes don't change your percentage."]
        .filter(Boolean)
        .join(" "),
      chip: plural(g.count, "class") + " off",
    });
  }
  return out;
};

// Per-day summary for the slider, built from the occurrences list.
const buildInfo = (occ) => {
  const map = {};
  for (const o of occ || []) {
    if (o.status === "not_counted") continue;
    const d = ymd(o.date);
    const i = (map[d] ||= { total: 0, active: 0, cancelled: 0, causes: {} });
    i.total += 1;
    if (o.status === "cancelled") {
      i.cancelled += 1;
      const k = o.cancelledBy?.type || "calendar_event";
      i.causes[k] = (i.causes[k] || 0) + 1;
    } else {
      i.active += 1;
    }
  }
  for (const i of Object.values(map)) i.kind = ["mass_bunk", "class_cancel", "calendar_event"].find((k) => i.causes[k]) || null;
  return map;
};

/* ------------------------------------------------------------------------------------------
   Data hooks. A request counter drops answers that arrive after a newer request started.
------------------------------------------------------------------------------------------ */

const useDay = (setupId, date, enabled = true) => {
  const [day, setDay] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const mine = ++seq.current;
    try {
      const d = await occurrencesApi.today(setupId, date || undefined);
      if (mine !== seq.current) return;
      setDay(d);
      setError("");
    } catch (e) {
      if (mine === seq.current) setError(errMsg(e, "We couldn't load your classes. Check your connection and try again."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [setupId, date, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    load();
  }, [load, enabled]);

  return { day, loading, error, reload: load };
};

const useStrip = (setupId, start) => {
  const [occ, setOcc] = useState(null);
  const [loading, setLoading] = useState(Boolean(start));
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!start) return;
    const mine = ++seq.current;
    try {
      const res = await occurrencesApi.range(setupId, { from: start, to: shift(start, WINDOW - 1) });
      if (mine !== seq.current) return;
      setOcc(asList(res, "occurrences"));
      setError("");
    } catch (e) {
      if (mine === seq.current) setError(errMsg(e, "We couldn't load the day slider. Try the arrows again."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [setupId, start]);

  useEffect(() => {
    if (!start) return;
    setLoading(true);
    load();
  }, [load, start]);

  const info = useMemo(() => buildInfo(occ), [occ]);
  return { info, loading, error, reload: load };
};

/* ------------------------------------------------------------------------------------------
   Pieces
------------------------------------------------------------------------------------------ */

const Skeleton = () => (
  <div className="space-y-3" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-[76px] rounded-2xl bg-[#161827]/[0.06] animate-pulse motion-reduce:animate-none" />
    ))}
  </div>
);

const Banner = ({ b }) => {
  const K = KINDS[b.kind] || KINDS.event;
  const Icon = K.icon;
  return (
    <div className={cx("rounded-2xl border px-3.5 sm:px-4 py-3.5 flex items-start gap-3", K.box)} role="status">
      <span className={cx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm", K.tile)}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[15px] sm:text-[15.5px] font-semibold leading-snug break-words">{b.title}</p>
          {b.chip && <span className={cx("inline-flex items-center h-5 px-2 rounded-full border text-[11.5px] font-medium bg-white/60", K.chip)}>{b.chip}</span>}
        </div>
        {b.text && <p className="text-[13px] mt-0.5 leading-relaxed opacity-85">{b.text}</p>}
      </div>
    </div>
  );
};

const ClassRow = ({ c, future, busy, onMark }) => {
  const official = c.lock === "official_cancellation";
  const outside = c.lock === "outside_range";
  const byCause = c.lock === "cancelled_by_cause";
  const locked = official || outside;
  const cancelled = c.status === "cancelled";
  const causeType = c.cancelledBy?.type;
  const kind = cancelled ? (KINDS[causeType] ? causeType : official ? "class_cancel" : "calendar_event") : null;
  const K = kind ? KINDS[kind] : null;
  const KIcon = K?.icon;

  return (
    <div className={cx("rounded-2xl border px-3 sm:px-4 py-3.5", K ? K.soft : "bg-white/60 border-white/80")}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="w-12 sm:w-14 shrink-0 text-right">
          <p className={cx("text-[14.5px] sm:text-[15px] font-semibold leading-tight", cancelled ? "text-[#6A6F85]" : "text-[#161827]")}>{c.plannedStartTime}</p>
          <p className="text-[12px] text-[#6A6F85]">{c.plannedEndTime}</p>
        </div>
        <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: c.subject?.color || "#6366F1", opacity: cancelled ? 0.4 : 1 }} />
        <div className="min-w-0 flex-1">
          <p className={cx("text-[15px] sm:text-[15.5px] font-semibold leading-snug break-words", cancelled ? "text-[#6A6F85]" : "text-[#161827]")}>{c.subject?.name || "Class"}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {K && (
              <span className={cx("inline-flex items-center gap-1 h-6 px-2.5 rounded-full border text-[12px] font-medium bg-white/60", K.chip)}>
                <KIcon className="w-3.5 h-3.5" aria-hidden="true" />
                {K.label}
                {official && (
                  <>
                    <Lock className="w-3 h-3 ml-0.5" aria-hidden="true" />
                    <span>by your CR</span>
                  </>
                )}
              </span>
            )}
            {outside && <Badge tone="neutral">Outside semester</Badge>}
            {c.classType && <Badge>{c.classType}</Badge>}
            {c.group && <Badge tone="brand">{c.group}</Badge>}
            {c.attendanceUnits > 1 && <Badge>{c.attendanceUnits} units</Badge>}
            {c.oneOff && <Badge tone="amber">Extra class</Badge>}
          </div>
          {cancelled && c.reason && <p className="text-[12.5px] text-[#6A6F85] mt-1.5">{c.reason}</p>}
        </div>
      </div>

      {!locked && (
        <div className="mt-3 sm:pl-[72px]">
          {/* three equal, thumb-sized buttons on phones; compact pills from sm up */}
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" role="group" aria-label={`Mark ${c.subject?.name || "class"}`}>
            {STATUSES.map((s) => {
              const futureBlocked = s.key === "present" && future;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={futureBlocked || busy}
                  aria-pressed={c.status === s.key}
                  onClick={() => onMark(c, s.key)}
                  className={cx(
                    "h-11 sm:h-9 px-2 sm:px-4 rounded-full text-[13.5px] sm:text-[13px] font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none active:scale-[0.98]",
                    FOCUS,
                    c.status === s.key ? s.on : "bg-white/70 border-white/80 text-[#161827]/75 hover:bg-white/95"
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {future && <p className="text-[12px] text-[#6A6F85] mt-2">This class hasn't happened yet, so it can't be marked Present.</p>}
          {byCause && <p className="text-[12px] text-[#6A6F85] mt-2">This class was cancelled. Marking it will override the cancellation.</p>}
        </div>
      )}
    </div>
  );
};

// One day: header, banners, classes. The parent decides the card around it.
//   variant: "today" | "tomorrow" | "detail"
const DayBlock = ({ variant, heading, date, state, todayStr, busyId, onMark, onJump }) => {
  const { day } = state;
  const waiting = !day && !state.error;
  const shown = ymd(day?.date) || date;
  const future = Boolean(todayStr && shown && shown > todayStr);
  const classes = day?.classes || [];
  const active = classes.filter((c) => c.status !== "cancelled" && c.status !== "not_counted");
  const marked = active.filter((c) => c.status !== "pending").length;
  const allOff = classes.length > 0 && active.length === 0;
  const banners = buildBanners(day);
  const next = variant === "today" ? day?.nextClass : null;
  const firstTime = active.length ? active.map((c) => c.plannedStartTime).sort()[0] : null;
  const isToday = variant === "today";

  return (
    <div>
      <div className={cx("px-4 sm:px-6 pt-5 pb-4", isToday && "bg-gradient-to-br from-[#5B52EE]/12 via-[#2B8DE0]/8 to-transparent")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cx("font-semibold tracking-tight text-[#161827]", isToday ? "text-[26px] sm:text-[28px] leading-tight" : "text-[18px] sm:text-[19px]")}>{heading}</h2>
            <p className="text-[13.5px] text-[#6A6F85] mt-0.5">{longDate(shown)}</p>
          </div>

          {next && day?.now && (
            <div className="w-full sm:w-auto rounded-2xl bg-white/70 border border-white/90 px-3.5 py-2.5 flex items-center gap-3 shadow-sm">
              <CalendarClock className="w-5 h-5 text-indigo-600 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[12px] text-[#6A6F85]">Next class</p>
                <p className="text-[14px] font-semibold text-[#161827] leading-tight break-words">
                  {next.subject?.name || "Class"} <span className="text-indigo-600 whitespace-nowrap">{untilText(day.now, next.plannedStartTime)}</span>
                </p>
              </div>
            </div>
          )}

          {!isToday && day && active.length > 0 && (
            <p className="text-[13px] text-[#6A6F85]">
              {plural(active.length, "class")}
              {firstTime ? `, starts ${firstTime}` : ""}
            </p>
          )}
        </div>

        {isToday && active.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[12.5px] text-[#6A6F85]">
              <span>{marked} of {active.length} marked</span>
              {marked === active.length && <span className="text-emerald-600 font-medium">All done</span>}
            </div>
            <div
              className="h-1.5 rounded-full bg-[#161827]/10 mt-1.5 overflow-hidden"
              role="progressbar"
              aria-label="Classes marked today"
              aria-valuemin={0}
              aria-valuemax={active.length}
              aria-valuenow={marked}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${(marked / active.length) * 100}%` }}
              />
            </div>
            {marked < active.length && <p className="text-[12.5px] text-[#6A6F85] mt-2">Tap Present, Absent or Excused for each class. Tap the same one again to undo.</p>}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 pb-5 space-y-3">
        {waiting ? (
          <Skeleton />
        ) : !day ? null : (
          <>
            {banners.map((b) => <Banner key={b.key} b={b} />)}

            {day && day.isWithinSetup === false && (
              <p className="text-[13px] text-[#6A6F85]">This date is outside your semester, so classes here are not counted.</p>
            )}

            {classes.length > 0 ? (
              classes.map((c) => <ClassRow key={c.id} c={c} future={future} busy={busyId === c.id} onMark={onMark} />)
            ) : (
              <div className="rounded-2xl border border-dashed border-[#161827]/15 px-4 py-6 text-center">
                <CalendarClock className="w-6 h-6 text-[#6A6F85] mx-auto" aria-hidden="true" />
                <p className="text-[14.5px] font-semibold text-[#161827] mt-2">No classes {isToday ? "today" : variant === "tomorrow" ? "tomorrow" : "on this day"}</p>
                <p className="text-[13px] text-[#6A6F85] mt-1">
                  {day?.nextDay ? `Your next class day is ${shortDate(ymd(day.nextDay.date))} (${plural(day.nextDay.classCount, "class")}).` : "Add weekly classes in your timetable to see them here."}
                </p>
                {day?.nextDay ? (
                  <Button variant="glass" size="sm" className="mt-3" onClick={() => onJump(ymd(day.nextDay.date))}>
                    View {shortDate(ymd(day.nextDay.date))}
                  </Button>
                ) : (
                  <Link to="/timetable" className="inline-block mt-3"><Button size="sm">Open timetable</Button></Link>
                )}
              </div>
            )}

            {allOff && (
              <p className="text-[12.5px] text-[#6A6F85]">Every class on this day is cancelled, so there is nothing to mark.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const DayChip = ({ date, info, selected, isToday, onSelect }) => {
  const total = info?.total || 0;
  const full = total > 0 && info.active === 0;
  const kind = info?.kind;
  const K = kind ? KINDS[kind] : null;
  const Icon = K?.icon;

  let sub;
  if (total === 0) {
    sub = <span className="text-[11px] opacity-60">No class</span>;
  } else if (full) {
    sub = (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold">
        {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
        {SHORT[kind] || "Off"}
      </span>
    );
  } else {
    sub = (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium">
        {info.cancelled > 0 && <span className={cx("w-1.5 h-1.5 rounded-full", K?.dot || "bg-rose-500")} />}
        {info.active} {info.active === 1 ? "class" : "classes"}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-date={date}
      aria-pressed={selected}
      aria-label={`${longDate(date)}${isToday ? ", today" : ""}: ${total === 0 ? "no classes" : full ? SHORT[kind] || "day off" : plural(info.active, "class")}`}
      onClick={() => onSelect(date)}
      className={cx(
        "snap-start shrink-0 w-[72px] sm:w-[78px] rounded-2xl border px-1.5 sm:px-2 py-2.5 text-center transition motion-reduce:transition-none active:scale-[0.97]",
        FOCUS,
        selected
          ? `${GRADIENT} border-transparent`
          : full && K
          ? `${K.chip} hover:brightness-95`
          : "bg-white/60 border-white/80 text-[#161827] hover:bg-white/90",
        isToday && !selected && "ring-2 ring-indigo-300"
      )}
    >
      <span className={cx("block text-[12px]", selected ? "text-white/85" : "text-[#6A6F85]", full && !selected && "text-current opacity-80")}>{isToday ? "Today" : weekdayShort(date)}</span>
      <span className="block text-[22px] font-semibold leading-tight">{dayNumber(date)}</span>
      <span className="mt-1 block">{sub}</span>
    </button>
  );
};

/* ------------------------------------------------------------------------------------------
   Page
------------------------------------------------------------------------------------------ */

const Dashboard = () => {
  const { setup } = useOutletContext();
  const setupId = setup._id;
  const target = setup.targetPercentage ?? 75;

  const [overall, setOverall] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [markError, setMarkError] = useState("");
  const [pendingOverride, setPendingOverride] = useState(null); // { c, status }
  const [winStart, setWinStart] = useState(null);
  const [selected, setSelected] = useState(null);
  const overallTimer = useRef(null);
  const stripRef = useRef(null);
  const browserRef = useRef(null);

  const today = useDay(setupId, null);
  const todayStr = today.day?.isToday && today.day.date ? ymd(today.day.date) : null;
  const tomorrowStr = todayStr ? shift(todayStr, 1) : null;
  const tomorrow = useDay(setupId, tomorrowStr, Boolean(tomorrowStr));
  const detail = useDay(setupId, selected, Boolean(selected));
  const strip = useStrip(setupId, winStart);

  const loadOverall = useCallback(async () => {
    try {
      setOverall(overallOf(await attendanceApi.overview(setupId)));
    } catch {
      /* keep the previous number */
    }
  }, [setupId]);

  useEffect(() => {
    loadOverall();
  }, [loadOverall]);

  useEffect(() => () => clearTimeout(overallTimer.current), []);

  // Slider starts on today.
  useEffect(() => {
    if (todayStr && !winStart) setWinStart(todayStr);
  }, [todayStr, winStart]);

  // Default pick for the slider's detail: the next class day after tomorrow.
  useEffect(() => {
    if (selected || !todayStr || !tomorrow.day) return;
    const nextDay = tomorrow.day.nextDay?.date ? ymd(tomorrow.day.nextDay.date) : shift(todayStr, 2);
    setSelected(nextDay);
    if (nextDay > shift(todayStr, WINDOW - 1)) setWinStart(shift(nextDay, -2));
  }, [selected, todayStr, tomorrow.day]);

  // Keep the selected chip centred in the slider.
  useEffect(() => {
    const box = stripRef.current;
    const el = box?.querySelector(`[data-date="${selected}"]`);
    if (!box || !el) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: calm ? "auto" : "smooth" });
  }, [selected, winStart, strip.loading]);

  const refreshOverallSoon = () => {
    clearTimeout(overallTimer.current);
    overallTimer.current = setTimeout(loadOverall, 600);
  };

  const reloadAll = async () => {
    await Promise.all([today.reload(), tomorrow.reload(), detail.reload(), strip.reload()]);
    refreshOverallSoon();
  };

  const applyMark = async (c, status, override = false) => {
    setBusyId(c.id);
    setMarkError("");
    try {
      if (!c.lock && c.status === status) await occurrencesApi.clear(setupId, c.id);
      else await occurrencesApi.mark(setupId, c.id, status, override);
      await reloadAll();
    } catch (e) {
      setMarkError(errMsg(e, "We couldn't save your attendance. Please try again."));
    } finally {
      setBusyId(null);
    }
  };

  const mark = (c, status) => {
    if (c.lock === "official_cancellation" || c.lock === "outside_range") return;

    if (c.lock === "cancelled_by_cause") {
      // A cause holds this class: only a real mark with an override is allowed, never "clear".
      if (status === c.status) return;
      setPendingOverride({ c, status });
      return;
    }
    applyMark(c, status);
  };

  const confirmOverride = async () => {
    const p = pendingOverride;
    setPendingOverride(null);
    if (p) await applyMark(p.c, p.status, true);
  };

  const selectDate = (d) => {
    setSelected(d);
    if (winStart && (d < winStart || d > shift(winStart, WINDOW - 1))) setWinStart(shift(d, -2));
  };

  // From a "next class day" button: pick the day and bring the slider into view.
  const jumpTo = (d) => {
    selectDate(d);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    browserRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };

  const days = winStart ? Array.from({ length: WINDOW }, (_, i) => shift(winStart, i)) : [];

  const upcoming = days
    .filter((d) => todayStr && d >= todayStr && strip.info[d]?.cancelled > 0)
    .slice(0, 5);

  const overallStatus = statusOf(overall?.pct, target);
  const overallTone = STATUS_META[overallStatus].tone;

  const error = today.error || tomorrow.error || detail.error || markError;

  if (today.loading && !today.day) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10">
      <PageHeader title="Dashboard" subtitle={`${setup.name} - ${[setup.branch, setup.section].filter(Boolean).join(" ")}`} />

      <Alert type="error" className="mb-4 sm:mb-5">{error}</Alert>

      {/* Phones: one column, attendance summary first. Large screens: two columns with a sticky side panel. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">
        <div className="order-2 lg:order-none lg:col-span-2 space-y-4 sm:space-y-5 min-w-0">
          {/* today */}
          <Card className="overflow-hidden">
            <DayBlock variant="today" heading="Today" date={todayStr} state={today} todayStr={todayStr} busyId={busyId} onMark={mark} onJump={jumpTo} />
          </Card>

          {/* tomorrow */}
          {tomorrowStr && (
            <Card className="overflow-hidden">
              <DayBlock variant="tomorrow" heading="Tomorrow" date={tomorrowStr} state={tomorrow} todayStr={todayStr} busyId={busyId} onMark={mark} onJump={jumpTo} />
            </Card>
          )}

          {/* day slider */}
          <Card className="overflow-hidden">
            <div ref={browserRef} className="scroll-mt-4 px-4 sm:px-6 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[18px] sm:text-[19px] font-semibold tracking-tight text-[#161827]">Browse other days</h2>
                  {winStart && <p className="text-[13px] text-[#6A6F85] mt-0.5">{rangeLabel(winStart, shift(winStart, WINDOW - 1))}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {todayStr && winStart !== todayStr && (
                    <Button variant="ghost" size="sm" onClick={() => setWinStart(todayStr)}>Back to today</Button>
                  )}
                  <Button variant="glass" size="sm" className="!px-0 w-10 sm:w-9" aria-label="Show earlier days" disabled={!winStart} onClick={() => setWinStart((w) => shift(w, -7))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="glass" size="sm" className="!px-0 w-10 sm:w-9" aria-label="Show later days" disabled={!winStart} onClick={() => setWinStart((w) => shift(w, 7))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* the strip bleeds to the card edges on phones; soft fades hint that it scrolls */}
              <div className="relative -mx-4 sm:-mx-6">
                <div
                  ref={stripRef}
                  className={cx("relative flex gap-2 overflow-x-auto snap-x scroll-px-4 pb-3 pt-4 px-4 sm:px-6", HIDE_SCROLLBAR)}
                  role="group"
                  aria-label="Days"
                >
                  {days.length === 0 || (strip.loading && Object.keys(strip.info).length === 0)
                    ? Array.from({ length: 7 }, (_, i) => <div key={i} className="shrink-0 w-[72px] sm:w-[78px] h-[92px] rounded-2xl bg-[#161827]/[0.06] animate-pulse motion-reduce:animate-none" />)
                    : days.map((d) => <DayChip key={d} date={d} info={strip.info[d]} selected={d === selected} isToday={d === todayStr} onSelect={selectDate} />)}
                </div>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-white/70 to-transparent sm:hidden" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-white/70 to-transparent sm:hidden" aria-hidden="true" />
              </div>
              {strip.error && <p className="text-[12.5px] text-amber-700 pb-2">{strip.error}</p>}
            </div>

            {selected && (
              <div className="border-t border-white/70">
                <DayBlock variant="detail" heading={selected === todayStr ? "Today" : selected === tomorrowStr ? "Tomorrow" : shortDate(selected)} date={selected} state={detail} todayStr={todayStr} busyId={busyId} onMark={mark} onJump={jumpTo} />
              </div>
            )}
          </Card>
        </div>

        {/* side panel: `contents` on phones so its cards can be ordered with the main column */}
        <aside className="contents lg:block lg:space-y-5 lg:sticky lg:top-6">
          <Card className="order-1 lg:order-none p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[#161827]">Overall attendance</h2>
              <Link to="/attendance" className="lg:hidden text-[13px] font-medium text-indigo-600 hover:underline">Details</Link>
            </div>
            {overall?.pct != null ? (
              <>
                <div className="flex items-center gap-4 mt-3">
                  <Ring value={overall.pct} target={target} tone={overallTone} size={96} className="shrink-0">
                    <span className="text-[19px] font-semibold text-[#161827] leading-none">{overall.pct}%</span>
                  </Ring>
                  <div className="min-w-0">
                    <p className={cx("text-[14.5px] font-semibold", { green: "text-emerald-600", amber: "text-amber-600", red: "text-rose-600", neutral: "text-[#6A6F85]" }[overallTone])}>{STATUS_META[overallStatus].label}</p>
                    <p className="text-[12.5px] text-[#6A6F85] mt-1">Attended {overall.attended} of {overall.held} classes</p>
                    <p className="text-[12.5px] text-[#6A6F85]">Your target is {target}%</p>
                  </div>
                </div>
                <div className="mt-4"><ProgressBar value={overall.pct} target={target} /></div>
              </>
            ) : (
              <p className="text-[14px] text-[#6A6F85] mt-2">Mark your classes to see your attendance percentage here.</p>
            )}
            <Link to="/attendance" className="hidden lg:inline-block mt-4"><Button variant="glass" size="sm">Subject breakdown and planner</Button></Link>
          </Card>

          {upcoming.length > 0 && (
            <Card className="order-3 lg:order-none p-4 sm:p-5">
              <h2 className="text-[16px] font-semibold text-[#161827]">Coming up</h2>
              <p className="text-[12.5px] text-[#6A6F85] mt-0.5">Classes cancelled in the next two weeks. Tap one to view that day.</p>
              <ul className="mt-3 space-y-2">
                {upcoming.map((d) => {
                  const i = strip.info[d];
                  const K = KINDS[i.kind] || KINDS.calendar_event;
                  const Icon = K.icon;
                  const full = i.active === 0;
                  return (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() => jumpTo(d)}
                        className={cx("w-full text-left rounded-2xl border px-3 py-2.5 flex items-center gap-3 hover:brightness-95 transition motion-reduce:transition-none", FOCUS, K.soft)}
                      >
                        <span className={cx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", K.tile)}>
                          <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-[#161827] truncate">{K.label}</span>
                          <span className="block text-[12.5px] text-[#6A6F85]">
                            {shortDate(d)} - {full ? "all classes off" : `${plural(i.cancelled, "class")} off`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </aside>
      </div>

      <Modal open={Boolean(pendingOverride)} onClose={() => setPendingOverride(null)} title="Mark this cancelled class?">
        <div className="space-y-5">
          <p className="text-[14px] leading-relaxed text-[#444A63]">
            This class was cancelled by one of your calendar events. If you mark it, it will count towards your attendance again.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <Button variant="glass" className="w-full sm:w-auto" onClick={() => setPendingOverride(null)}>Keep it cancelled</Button>
            <Button className="w-full sm:w-auto" onClick={confirmOverride}>Mark anyway</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Dashboard;