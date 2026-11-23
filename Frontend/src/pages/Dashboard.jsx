import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Ban, CalendarClock, CalendarOff, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, Lock, PartyPopper, Sparkles, Sun } from "lucide-react";
import { asList, attendanceApi, errMsg, occurrencesApi } from "../api/endpoints";
import { STATUS_META, overallOf, plural, statusOf } from "../lib/attendance";
import { Alert, Badge, Button, Card, Modal, PageHeader, PageSpinner, ProgressBar, cx } from "../components/Ui";
import Ring from "../components/Ring";

/* ------------------------------------------------------------------------------------------
   Theme. Light values are exactly the old Tailwind colours; dark values are new.
   Dark mode is detected from <html>/<body> class "dark", data-theme="dark" or data-mode="dark".
   If your app switches themes another way, change DARK / DARK_PAGE and nothing else.
------------------------------------------------------------------------------------------ */

const DARK = ':is(.dark,[data-theme="dark"],[data-mode="dark"]) .dbd';
const DARK_PAGE = 'html:is(.dark,[data-theme="dark"],[data-mode="dark"]) body,body:is(.dark,[data-theme="dark"],[data-mode="dark"])';

const themeCss = `
/* ---------- light (same look as before) ---------- */
.dbd{--acc:#4F46E5;--acc-solid:#4F46E5;--ok:#047857;--warn:#B45309;--bad:#A32A42}
.dbd .t-acc{color:var(--acc)}
.dbd .t-ok{color:var(--ok)}
.dbd .t-warn{color:var(--warn)}
.dbd .t-bad{color:var(--bad)}
.dbd .dbd-ring{--tw-ring-color:#A5B4FC}

/* one set of variables per kind: bg, border, box text, chip text, solid colour, icon colour */
.dbd .k-violet{--k-bg:#F5F3FF;--k-bd:#DDD6FE;--k-tx:#2E1065;--k-chip:#5B21B6;--k-solid:#8B5CF6;--k-on:#fff}
.dbd .k-amber {--k-bg:#FFFBEB;--k-bd:#FDE68A;--k-tx:#78350F;--k-chip:#92400E;--k-solid:#F59E0B;--k-on:#fff}
.dbd .k-rose  {--k-bg:#FFF1F2;--k-bd:#FECDD3;--k-tx:#A32A42;--k-chip:#A32A42;--k-solid:#F43F5E;--k-on:#fff}
.dbd .k-indigo{--k-bg:#EEF2FF;--k-bd:#C7D2FE;--k-tx:#312E81;--k-chip:#3730A3;--k-solid:#4F46E5;--k-on:#fff}
.dbd .k-sky   {--k-bg:#F0F9FF;--k-bd:#BAE6FD;--k-tx:#0C4A6E;--k-chip:#0369A1;--k-solid:#0EA5E9;--k-on:#fff}

.dbd .kx-box{background:var(--k-bg);border-color:var(--k-bd);color:var(--k-tx)}
.dbd .kx-soft{background:color-mix(in srgb,var(--k-bg) 70%,transparent);border-color:var(--k-bd)}
.dbd .kx-tile{background:var(--k-solid);color:var(--k-on)}
.dbd .kx-dot{background:var(--k-solid)}
/* zero specificity: where a chip also has bg-[color:var(--surface)] that one still wins, as before */
:where(.dbd .kx-chip){background:var(--k-bg);border-color:var(--k-bd);color:var(--k-chip)}

/* ---------- dark ---------- */
${DARK_PAGE}{background:#0D1018}
${DARK}{
  color-scheme:dark;
  --surface:#151A26;--inset:#1B2130;--track:#2B3347;
  --line:#2B3347;--line-soft:#232A3B;--line-strong:#46526E;
  --ink:#F2F4FA;--body:#CDD2E1;--muted:#9BA4BA;--faint:#7F89A1;
  --acc:#A5ACFF;--acc-solid:#5B54EA;--ok:#5EE0A8;--warn:#FBBF58;--bad:#FF8FA3;
  color:var(--body);
}
${DARK} .dbd-ring{--tw-ring-color:rgba(139,147,255,.65)}

${DARK} .k-violet{--k-bg:rgba(139,92,246,.17);--k-bd:rgba(167,139,250,.40);--k-tx:#EBE5FF;--k-chip:#D8CCFF;--k-solid:#8B5CF6;--k-on:#fff}
${DARK} .k-amber {--k-bg:rgba(245,158,11,.14);--k-bd:rgba(251,191,36,.38);--k-tx:#FDEBB8;--k-chip:#FCDC93;--k-solid:#F59E0B;--k-on:#1C1300}
${DARK} .k-rose  {--k-bg:rgba(244,63,94,.15);--k-bd:rgba(251,113,133,.42);--k-tx:#FFC9D3;--k-chip:#FFB6C3;--k-solid:#F43F5E;--k-on:#fff}
${DARK} .k-indigo{--k-bg:rgba(99,102,241,.20);--k-bd:rgba(129,140,248,.45);--k-tx:#DEE1FF;--k-chip:#CBD0FF;--k-solid:#5B54EA;--k-on:#fff}
${DARK} .k-sky   {--k-bg:rgba(14,165,233,.15);--k-bd:rgba(56,189,248,.40);--k-tx:#D3F0FF;--k-chip:#AEE4FF;--k-solid:#0EA5E9;--k-on:#04141F}

/* skeleton, inputs, dividers */
${DARK} .animate-pulse{opacity:.7}
${DARK} input,${DARK} select,${DARK} textarea{background:var(--inset);color:var(--ink);border-color:var(--line)}
${DARK} input::placeholder,${DARK} textarea::placeholder{color:var(--faint)}

/* Safety net for light-only Tailwind colours used by shared components (Card, Badge, Button,
   PageHeader, Alert, ProgressBar) that live in other files. */
${DARK} .bg-white,${DARK} [class*="bg-white/"]{background-color:var(--surface)!important}
${DARK} .bg-slate-50,${DARK} .bg-gray-50,${DARK} .bg-slate-100,${DARK} .bg-gray-100{background-color:var(--inset)!important}
${DARK} .text-slate-900,${DARK} .text-slate-800,${DARK} .text-gray-900,${DARK} .text-gray-800{color:var(--ink)!important}
${DARK} .text-slate-700,${DARK} .text-slate-600,${DARK} .text-gray-700,${DARK} .text-gray-600{color:var(--body)!important}
${DARK} .text-slate-500,${DARK} .text-gray-500{color:var(--muted)!important}
${DARK} .text-slate-400,${DARK} .text-gray-400{color:var(--faint)!important}
${DARK} .border-slate-100,${DARK} .border-slate-200,${DARK} .border-gray-100,${DARK} .border-gray-200{border-color:var(--line)!important}
${DARK} .bg-indigo-50,${DARK} .bg-indigo-100{background-color:rgba(139,147,255,.16)!important}
${DARK} .text-indigo-600,${DARK} .text-indigo-700,${DARK} .text-indigo-800{color:#A5ACFF!important}
${DARK} .bg-emerald-50{background-color:rgba(52,211,153,.15)!important}
${DARK} .text-emerald-600,${DARK} .text-emerald-700,${DARK} .text-emerald-800{color:#5EE0A8!important}
${DARK} .bg-amber-50{background-color:rgba(251,191,36,.15)!important}
${DARK} .text-amber-600,${DARK} .text-amber-700,${DARK} .text-amber-800{color:#FBBF58!important}
${DARK} .bg-rose-50{background-color:rgba(251,113,133,.15)!important}
${DARK} .text-rose-600,${DARK} .text-rose-700,${DARK} .text-rose-800{color:#FF8FA3!important}
${DARK} .border-rose-200,${DARK} .border-amber-200,${DARK} .border-indigo-200{border-color:var(--line-strong)!important}
`;

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
   Colours carry meaning (amber = day off, rose = cancelled, sky = quiz, indigo = exam,
   violet = mass bunk) and every kind also has a text label.
   The actual colours live in themeCss above (one variable set per kind, light and dark).
------------------------------------------------------------------------------------------ */

const tint = (c) => ({
  box: `kx-box k-${c}`,
  soft: `kx-soft k-${c}`,
  tile: `kx-tile k-${c}`,
  chip: `kx-chip k-${c}`,
  dot: `kx-dot k-${c}`,
});

const KINDS = {
  mass_bunk: { label: "Mass bunk", icon: PartyPopper, ...tint("violet") },
  holiday: { label: "Holiday", icon: Sun, ...tint("amber") },
  calendar_event: { label: "Day off", icon: CalendarOff, ...tint("amber") },
  class_cancel: { label: "Class cancelled", icon: Ban, ...tint("rose") },
  exam: { label: "Exam", icon: GraduationCap, ...tint("indigo") },
  quiz: { label: "Quiz", icon: ClipboardList, ...tint("sky") },
  event: {
    label: "Event",
    icon: Sparkles,
    box: "bg-[color:var(--inset)] border-[color:var(--line)] text-[color:var(--ink)]",
    soft: "bg-[color:var(--inset)] border-[color:var(--line)]",
    tile: "bg-[color:var(--muted)] text-white",
    chip: "bg-[color:var(--inset)] border-[color:var(--line)] text-[color:var(--body)]",
    dot: "bg-[color:var(--muted)]",
  },
};

const EVENT_KIND = { holiday: "holiday", break: "holiday", exam: "exam", quiz: "quiz", event: "event" };
const SHORT = { mass_bunk: "Bunk", calendar_event: "Off", class_cancel: "Cancelled" };

// The server accepts only present / absent / excused from a student.
// "Cancelled" is never a student choice: it comes from a holiday, mass bunk or CR cancellation.
// Unmarked: surface with a hairline border. Marked: solid emerald / rose / sky.
const STATUSES = [
  { key: "present", label: "Present", on: "bg-emerald-500 text-white border-emerald-500" },
  { key: "absent", label: "Absent", on: "bg-rose-600 text-white border-rose-600" },
  { key: "excused", label: "Excused", on: "bg-sky-500 text-white border-sky-500" },
];

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--surface)]";
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
  <div className="space-y-2.5" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className="h-[76px] rounded-xl bg-[color:var(--line-soft)] animate-pulse motion-reduce:animate-none" />
    ))}
  </div>
);

const Banner = ({ b }) => {
  const K = KINDS[b.kind] || KINDS.event;
  const Icon = K.icon;
  return (
    <div className={cx("rounded-xl border px-3.5 sm:px-4 py-3.5 flex items-start gap-3", K.box)} role="status">
      <span className={cx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", K.tile)}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[15px] font-semibold leading-snug break-words">{b.title}</p>
          {b.chip && <span className={cx("inline-flex items-center h-5 px-2 rounded-full border text-[11.5px] font-medium bg-[color:var(--surface)]", K.chip)}>{b.chip}</span>}
        </div>
        {b.text && <p className="text-[13px] mt-0.5 leading-relaxed">{b.text}</p>}
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
    <div className={cx("rounded-xl px-3 sm:px-4 py-3.5", K ? cx("border", K.soft) : "bg-[color:var(--inset)]")}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <div className="w-12 sm:w-14 shrink-0 text-right">
          <p className={cx("text-[14.5px] sm:text-[15px] font-semibold leading-tight tabular-nums", cancelled ? "text-[color:var(--muted)]" : "text-[color:var(--ink)]")}>{c.plannedStartTime}</p>
          <p className="text-[12px] text-[color:var(--muted)] tabular-nums">{c.plannedEndTime}</p>
        </div>
        <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: c.subject?.color || "#6366F1", opacity: cancelled ? 0.4 : 1 }} />
        <div className="min-w-0 flex-1">
          <p className={cx("text-[15px] font-semibold leading-snug break-words", cancelled ? "text-[color:var(--muted)]" : "text-[color:var(--ink)]")}>{c.subject?.name || "Class"}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {K && (
              <span className={cx("inline-flex items-center gap-1 h-6 px-2.5 rounded-full border text-[12px] font-medium bg-[color:var(--surface)]", K.chip)}>
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
          {cancelled && c.reason && <p className="text-[12.5px] text-[color:var(--muted)] mt-1.5">{c.reason}</p>}
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
                    "h-11 sm:h-9 px-2 sm:px-4 rounded-full text-[13.5px] sm:text-[13px] font-medium border transition-colors disabled:opacity-60 disabled:cursor-not-allowed motion-reduce:transition-none active:scale-[0.98]",
                    FOCUS,
                    c.status === s.key ? s.on : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--body)] hover:border-[color:var(--line-strong)]"
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {future && <p className="text-[12px] text-[color:var(--muted)] mt-2">This class hasn't happened yet, so it can't be marked Present.</p>}
          {byCause && <p className="text-[12px] text-[color:var(--muted)] mt-2">This class was cancelled. Marking it will override the cancellation.</p>}
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
      <div className="px-3.5 min-[380px]:px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cx("font-semibold tracking-tight text-[color:var(--ink)]", isToday ? "text-[24px] sm:text-[26px] leading-tight" : "text-[17px] sm:text-[18px]")}>{heading}</h2>
            <p className="text-[13.5px] text-[color:var(--muted)] mt-0.5">{longDate(shown)}</p>
          </div>

          {next && day?.now && (
            <div className="w-full sm:w-auto rounded-xl bg-[color:var(--inset)] px-3.5 py-2.5 flex items-center gap-3">
              <CalendarClock className="w-5 h-5 t-acc shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[12px] text-[color:var(--muted)]">Next class</p>
                <p className="text-[14px] font-semibold text-[color:var(--ink)] leading-tight break-words">
                  {next.subject?.name || "Class"} <span className="t-acc whitespace-nowrap tabular-nums">{untilText(day.now, next.plannedStartTime)}</span>
                </p>
              </div>
            </div>
          )}

          {!isToday && day && active.length > 0 && (
            <p className="text-[13px] text-[color:var(--muted)] tabular-nums">
              {plural(active.length, "class")}
              {firstTime ? `, starts ${firstTime}` : ""}
            </p>
          )}
        </div>

        {isToday && active.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[12.5px] text-[color:var(--muted)] tabular-nums">
              <span>{marked} of {active.length} marked</span>
              {marked === active.length && <span className="t-ok font-medium">All done</span>}
            </div>
            <div
              className="h-1.5 rounded-full bg-[color:var(--track)] mt-1.5 overflow-hidden"
              role="progressbar"
              aria-label="Classes marked today"
              aria-valuemin={0}
              aria-valuemax={active.length}
              aria-valuenow={marked}
            >
              <div
                className="h-full rounded-full bg-[color:var(--acc-solid)] transition-[width] duration-500 motion-reduce:transition-none"
                style={{ width: `${(marked / active.length) * 100}%` }}
              />
            </div>
            {marked < active.length && <p className="text-[12.5px] text-[color:var(--muted)] mt-2">Tap Present, Absent or Excused for each class. Tap the same one again to undo.</p>}
          </div>
        )}
      </div>

      <div className="px-3.5 min-[380px]:px-4 sm:px-5 pb-4 sm:pb-5 space-y-2.5">
        {waiting ? (
          <Skeleton />
        ) : !day ? null : (
          <>
            {banners.map((b) => <Banner key={b.key} b={b} />)}

            {day && day.isWithinSetup === false && (
              <p className="text-[13px] text-[color:var(--muted)]">This date is outside your semester, so classes here are not counted.</p>
            )}

            {classes.length > 0 ? (
              classes.map((c) => <ClassRow key={c.id} c={c} future={future} busy={busyId === c.id} onMark={onMark} />)
            ) : (
              <div className="rounded-xl bg-[color:var(--inset)] px-4 py-6 text-center">
                <CalendarClock className="w-6 h-6 text-[color:var(--muted)] mx-auto" aria-hidden="true" />
                <p className="text-[14.5px] font-semibold text-[color:var(--ink)] mt-2">No classes {isToday ? "today" : variant === "tomorrow" ? "tomorrow" : "on this day"}</p>
                <p className="text-[13px] text-[color:var(--muted)] mt-1">
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
              <p className="text-[12.5px] text-[color:var(--muted)]">Every class on this day is cancelled, so there is nothing to mark.</p>
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
    sub = <span className="text-[11px] opacity-70">No class</span>;
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
        "snap-start shrink-0 w-[72px] sm:w-[78px] rounded-xl border px-1.5 sm:px-2 py-2.5 text-center transition-colors motion-reduce:transition-none active:scale-[0.98]",
        FOCUS,
        selected
          ? "bg-[color:var(--acc-solid)] border-[color:var(--acc-solid)] text-white"
          : full && K
          ? K.chip
          : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--ink)] hover:border-[color:var(--line-strong)]",
        isToday && !selected && "ring-2 dbd-ring"
      )}
    >
      <span className={cx("block text-[12px]", selected ? "text-white/85" : "text-[color:var(--muted)]", full && !selected && "text-current")}>{isToday ? "Today" : weekdayShort(date)}</span>
      <span className="block text-[22px] font-semibold leading-tight tabular-nums">{dayNumber(date)}</span>
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
    <div className="dbd max-w-5xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-6 sm:py-10">
      <style>{themeCss}</style>
      <PageHeader title="Dashboard" subtitle={`${setup.name} - ${[setup.branch, setup.section].filter(Boolean).join(" ")}`} />

      <Alert type="error" className="mb-2.5 sm:mb-4">{error}</Alert>

      {/* Phones: one column, attendance summary first. Large screens: two columns with a sticky side panel. */}
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
        <div className="order-2 lg:order-none lg:col-span-2 space-y-2.5 sm:space-y-4 min-w-0">
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
            <div ref={browserRef} className="scroll-mt-4 px-3.5 min-[380px]:px-4 sm:px-5 pt-4 sm:pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[17px] sm:text-[18px] font-semibold tracking-tight text-[color:var(--ink)]">Browse other days</h2>
                  {winStart && <p className="text-[13px] text-[color:var(--muted)] mt-0.5">{rangeLabel(winStart, shift(winStart, WINDOW - 1))}</p>}
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

              {/* the strip bleeds to the card edges on phones */}
              <div className="-mx-3.5 min-[380px]:-mx-4 sm:-mx-5">
                <div
                  ref={stripRef}
                  className={cx("flex gap-2 overflow-x-auto snap-x scroll-px-4 pb-3 pt-4 px-3.5 min-[380px]:px-4 sm:px-5", HIDE_SCROLLBAR)}
                  role="group"
                  aria-label="Days"
                >
                  {days.length === 0 || (strip.loading && Object.keys(strip.info).length === 0)
                    ? Array.from({ length: 7 }, (_, i) => <div key={i} className="shrink-0 w-[72px] sm:w-[78px] h-[92px] rounded-xl bg-[color:var(--line-soft)] animate-pulse motion-reduce:animate-none" />)
                    : days.map((d) => <DayChip key={d} date={d} info={strip.info[d]} selected={d === selected} isToday={d === todayStr} onSelect={selectDate} />)}
                </div>
              </div>
              {strip.error && <p className="text-[12.5px] t-warn pb-2">{strip.error}</p>}
            </div>

            {selected && (
              <div className="border-t border-[color:var(--line-soft)]">
                <DayBlock variant="detail" heading={selected === todayStr ? "Today" : selected === tomorrowStr ? "Tomorrow" : shortDate(selected)} date={selected} state={detail} todayStr={todayStr} busyId={busyId} onMark={mark} onJump={jumpTo} />
              </div>
            )}
          </Card>
        </div>

        {/* side panel: `contents` on phones so its cards can be ordered with the main column */}
        <aside className="contents lg:block lg:space-y-4 lg:sticky lg:top-6">
          <Card className="order-1 lg:order-none p-3.5 min-[380px]:p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Overall attendance</h2>
              <Link to="/attendance" className="lg:hidden text-[13px] font-medium t-acc hover:underline">Details</Link>
            </div>
            {overall?.pct != null ? (
              <>
                <div className="flex items-center gap-4 mt-3">
                  <Ring value={overall.pct} target={target} tone={overallTone} size={96} className="shrink-0">
                    <span className="text-[19px] font-semibold text-[color:var(--ink)] leading-none tabular-nums">{overall.pct}%</span>
                  </Ring>
                  <div className="min-w-0">
                    <p className={cx("text-[14.5px] font-semibold", { green: "t-ok", amber: "t-warn", red: "t-bad", neutral: "text-[color:var(--muted)]" }[overallTone])}>{STATUS_META[overallStatus].label}</p>
                    <p className="text-[12.5px] text-[color:var(--muted)] mt-1 tabular-nums">Attended {overall.attended} of {overall.held} classes</p>
                    <p className="text-[12.5px] text-[color:var(--muted)] tabular-nums">Your target is {target}%</p>
                  </div>
                </div>
                <div className="mt-4"><ProgressBar value={overall.pct} target={target} /></div>
              </>
            ) : (
              <p className="text-[14px] text-[color:var(--muted)] mt-2">Mark your classes to see your attendance percentage here.</p>
            )}
            <Link to="/attendance" className="hidden lg:inline-block mt-4"><Button variant="glass" size="sm">Subject breakdown and planner</Button></Link>
          </Card>

          {upcoming.length > 0 && (
            <Card className="order-3 lg:order-none p-3.5 min-[380px]:p-4 sm:p-5">
              <h2 className="text-[16px] font-semibold text-[color:var(--ink)]">Coming up</h2>
              <p className="text-[12.5px] text-[color:var(--muted)] mt-0.5">Classes cancelled in the next two weeks. Tap one to view that day.</p>
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
                        className={cx("w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 transition-colors hover:border-[color:var(--line-strong)] motion-reduce:transition-none", FOCUS, K.soft)}
                      >
                        <span className={cx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", K.tile)}>
                          <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{K.label}</span>
                          <span className="block text-[12.5px] text-[color:var(--muted)] tabular-nums">
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
          <p className="text-[14px] leading-relaxed text-[color:var(--body)]">
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