import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { BellRing, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Minus, RefreshCw, X } from "lucide-react";
import { Badge, cx } from "../Ui";
import { Glass, MAX_OFF, addDays, dayName, fmtLong, fmtShort, glassGhost, local, toIso } from "./Shared";

/* Selected state: same indigo to blue gradient as the filter pills on the Attendance page (replaces the black `lq-on`). */
const SEL = "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent shadow-md shadow-indigo-500/25";

const EVENT_TYPES = ["holiday", "exam", "quiz"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]; // Monday first

/* ---------- mark button: full-width labelled pills on phones, round icons on desktop ---------- */
const MarkBtn = ({ on, kind, label, onClick, disabled, children }) => (
  <button type="button" aria-pressed={on} aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className={cx("min-h-11 sm:min-h-10 h-auto min-w-0 w-full sm:w-10 rounded-full flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 py-1.5 sm:p-0 text-[12px] sm:text-[13px] font-medium border transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
      on
        ? {
            p: "bg-gradient-to-b from-emerald-400 to-emerald-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(16,185,129,.8)]",
            a: "bg-gradient-to-b from-rose-400 to-rose-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(244,63,94,.8)]",
            e: "bg-gradient-to-b from-sky-400 to-sky-500 border-white/40 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_20px_-8px_rgba(14,165,233,.8)]",
          }[kind]
        : "lq-btn text-[#161827]/70")}>
    {children}
  </button>
);

/* One class row. `readOnly` is used for other days, where marking isn't open yet. */
const ClassRow = ({ c, next, onPick, readOnly }) => {
  const cancelled = c.status === "cancelled";
  const locked = c.lock === "outside_range" || c.lock === "official_cancellation" || c.status === "not_counted";
  return (
    <li className={cx("relative grid grid-cols-[3.1rem_minmax(0,1fr)] sm:grid-cols-[3.1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lq-in pl-5 pr-3 py-2.5 overflow-hidden", next && "lq-glow")}>
      <span aria-hidden="true" className="absolute left-2 inset-y-2.5 w-1 rounded-full" style={{ background: c.color }} />
      <div className="text-[11.5px] leading-tight tabular-nums text-[#6A6F85]">
        <span className="block text-[13.5px] font-semibold text-[#161827]">{c.start}</span>{c.end}
      </div>
      <div className="min-w-0">
        <p className={cx("text-[14px] font-semibold text-[#161827] truncate", cancelled && "line-through opacity-60")}>{c.name || c.code}</p>
        <p className="text-[12px] text-[#6A6F85] truncate capitalize">{[c.type, c.room].filter(Boolean).join(", ")}</p>
        {(next || (cancelled && !locked && !readOnly)) && <span className="mt-1 inline-block">{next ? <Badge tone="brand">Up next</Badge> : <Badge tone="red">Cancelled</Badge>}</span>}
      </div>
      <div className={cx("sm:justify-self-end", !readOnly && "col-span-2 sm:col-span-1")}>
        {readOnly ? (
          cancelled ? <Badge tone="red">Cancelled</Badge> : <Badge tone="brand">Upcoming</Badge>
        ) : locked ? (
          <Badge tone={cancelled ? "red" : "amber"}>{cancelled ? "Cancelled by CR" : "Not counted"}</Badge>
        ) : (
          <div className="grid grid-cols-3 sm:flex gap-1.5 min-w-0">
            <MarkBtn on={c.status === "present"} kind="p" label={`Mark ${c.name} present`} onClick={() => onPick(c, "present")}><Check className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Present</span></MarkBtn>
            <MarkBtn on={c.status === "absent"} kind="a" label={`Mark ${c.name} absent`} onClick={() => onPick(c, "absent")}><X className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Absent</span></MarkBtn>
            <MarkBtn on={c.status === "excused"} kind="e" label={`Mark ${c.name} excused`} onClick={() => onPick(c, "excused")}><Minus className="w-4 h-4" aria-hidden="true" /><span className="sm:hidden">Excused</span></MarkBtn>
          </div>
        )}
      </div>
    </li>
  );
};

/* ---------- calendar picker: bottom sheet on phones, centred card on desktop ----------
   Rendered in a portal so the glass card's backdrop-filter can't trap its fixed positioning. */
const CalendarSheet = ({ base, off, events, onPick, onClose }) => {
  const [view, setView] = useState(() => {
    const d = addDays(base, off);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const y = view.getFullYear(), m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // Monday-first offset
  const dim = new Date(y, m + 1, 0).getDate();
  const offOf = (date) => Math.round((date - base) / 864e5);

  const firstOff = offOf(new Date(y, m, 1));
  const lastOff = offOf(new Date(y, m, dim));
  const canPrev = firstOff > 0;
  const canNext = lastOff < MAX_OFF;

  const marked = useMemo(() => {
    const set = new Set();
    (events || []).forEach((e) => {
      if (e.confirmed === false || !EVENT_TYPES.includes(e.type)) return;
      for (let d = 1; d <= dim; d += 1) {
        const iso = toIso(new Date(y, m, d));
        if (e.startDate <= iso && e.endDate >= iso) set.add(d);
      }
    });
    return set;
  }, [events, y, m, dim]);

  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const title = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const step = "lq-btn shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[#161827] disabled:opacity-35 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Pick a date">
      <div className="absolute inset-0 bg-[#161827]/35 backdrop-blur-sm" onClick={onClose} />
      <div
        className="hm-fade relative w-full max-w-[380px] rounded-[28px] border border-white/90 bg-[#F7F8FF]/90 backdrop-blur-2xl p-4 sm:p-5 shadow-[inset_0_1px_0_#fff,0_30px_60px_-24px_rgba(30,32,70,0.55)] max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <span aria-hidden="true" className="sm:hidden mx-auto mb-3 block h-1 w-10 rounded-full bg-[#161827]/15" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-[28px] bg-gradient-to-b from-white/70 to-transparent" />

        <div className="relative flex items-center gap-2">
          <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(new Date(y, m - 1, 1))} className={step}>
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h3 className="flex-1 min-w-0 text-center text-[16px] font-semibold tracking-tight text-[#161827] truncate" aria-live="polite">{title}</h3>
          <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView(new Date(y, m + 1, 1))} className={step}>
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
          <button ref={closeRef} type="button" aria-label="Close calendar" onClick={onClose} className={cx(step, "ml-0.5")}>
            <X className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="relative mt-4 grid grid-cols-7 gap-1 text-center text-[11.5px] font-medium text-[#6A6F85]" aria-hidden="true">
          {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
        </div>

        <div className="relative mt-1.5 grid grid-cols-7 gap-1" role="grid" aria-label={title}>
          {cells.map((d, i) => {
            if (d == null) return <span key={`b${i}`} aria-hidden="true" />;
            const date = new Date(y, m, d);
            const o = offOf(date);
            const ok = o >= 0 && o <= MAX_OFF;
            const sel = o === off;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                disabled={!ok}
                aria-selected={sel}
                aria-label={fmtLong(toIso(date))}
                onClick={() => onPick(o)}
                className={cx(
                  "relative flex flex-col items-center justify-center gap-0.5 aspect-square rounded-2xl border text-[14px] font-semibold tabular-nums transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                  sel ? SEL : ok ? "lq-btn text-[#161827]" : "border-transparent text-[#161827]/25 pointer-events-none",
                  o === 0 && !sel && "!border-indigo-300"
                )}
              >
                {d}
                <span aria-hidden="true" className={cx("h-1 w-1 rounded-full", marked.has(d) && ok ? (sel ? "bg-white" : "bg-amber-500") : "bg-transparent")} />
              </button>
            );
          })}
        </div>

        <div className="relative mt-4 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11.5px] text-[#6A6F85]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />Holiday, exam or quiz
          </span>
          <button type="button" disabled={off === 0 && firstOff <= 0 && lastOff >= 0} onClick={() => onPick(0)} className={cx(glassGhost, "!min-h-9 disabled:opacity-40 disabled:pointer-events-none")}>
            Jump to today
          </button>
        </div>

        <Link
          to="/calendar"
          onClick={onClose}
          className="relative mt-3 flex items-center justify-center gap-2 h-11 rounded-full text-[14px] font-medium text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_24px_-12px_rgba(79,70,229,0.8)] active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          <CalendarRange className="w-4 h-4" aria-hidden="true" />
          Open full calendar
        </Link>
      </div>
    </div>,
    document.body
  );
};

/* 2 / 6: Today / Tomorrow / Next, arrows, day strip, swipe, load-on-tap, calendar picker. */
export default function ScheduleCard({ today, days, events, note, onMark, onLoadDay, demo }) {
  const [off, setOff] = useState(0);
  const [ask, setAsk] = useState(null);
  const [calOpen, setCalOpen] = useState(false);
  const [status, setStatus] = useState({}); // date -> "loading" | "done" | "failed"
  const [cache, setCache] = useState({}); // days returned by onLoadDay, so we don't depend only on the parent storing them
  const asked = useRef(new Set()); // dates already requested; the guard that stops refetch loops
  const loadRef = useRef(onLoadDay); // always the latest onLoadDay, without it being an effect dependency
  const touch = useRef(null);
  const calBtn = useRef(null);

  useEffect(() => { loadRef.current = onLoadDay; });

  const base = useMemo(() => local(today.date), [today.date]);
  const dateAt = (o) => addDays(base, o);
  const iso = toIso(dateAt(off));
  const isToday = off === 0;

  // Key by plain YYYY-MM-DD so an ISO timestamp from the API still matches.
  const byDate = useMemo(
    () => Object.fromEntries((days || []).map((d) => [String(d.date).slice(0, 10), d])),
    [days]
  );
  const dayOf = (date) => byDate[date] || cache[date];

  const stripStart = Math.floor(off / 7) * 7;
  const stripFirst = toIso(dateAt(stripStart));

  const request = useCallback((date) => {
    const fn = loadRef.current;
    if (!fn || asked.current.has(date)) return;
    asked.current.add(date);
    setStatus((s) => ({ ...s, [date]: "loading" }));
    Promise.resolve()
      .then(() => fn(date))
      .then((res) => {
        if (res && Array.isArray(res.classes)) setCache((c) => ({ ...c, [date]: res }));
        setStatus((s) => ({ ...s, [date]: "done" }));
      })
      .catch((err) => {
        console.error("ScheduleCard: could not load", date, err);
        setStatus((s) => ({ ...s, [date]: "failed" }));
      });
  }, []);

  // Load the tapped day (and the first day of the visible strip) once each.
  useEffect(() => {
    if (demo) return;
    [iso, stripFirst].forEach((date) => {
      if (date !== today.date && !byDate[date] && !cache[date]) request(date);
    });
  }, [iso, stripFirst, byDate, cache, demo, today.date, request]);

  const classes = isToday ? today.classes : dayOf(iso)?.classes;
  const known = classes != null;
  const nextId = isToday ? today.nextClass?.id : null;
  const dayEvents = isToday
    ? today.events || []
    : (events || []).filter((e) => e.confirmed !== false && e.startDate <= iso && e.endDate >= iso && EVENT_TYPES.includes(e.type));

  const label = off === 0 ? "Today" : off === 1 ? "Tomorrow" : dayName(iso, "long");
  const segIdx = Math.min(off, 2);
  const countOf = (o) => (o === 0 ? today.classes.length : dayOf(toIso(dateAt(o)))?.classes?.length);

  const go = (o) => { setAsk(null); setOff(Math.max(0, Math.min(MAX_OFF, o))); };
  const pick = (c, s) => (c.lock === "cancelled_by_cause" ? setAsk({ c, s }) : onMark(c, s));
  const retry = () => { asked.current.delete(iso); request(iso); };

  const closeCal = useCallback(() => {
    setCalOpen(false);
    calBtn.current?.focus();
  }, []);
  const pickFromCal = (o) => { go(o); setCalOpen(false); calBtn.current?.focus(); };

  // Loaded without error but nothing usable came back: show it instead of an endless skeleton.
  const loadProblem = !known && (status[iso] === "failed" || status[iso] === "done");

  const strip = Array.from({ length: 7 }, (_, k) => stripStart + k).filter((o) => o <= MAX_OFF);

  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(off + (dx < 0 ? 1 : -1));
  };

  const segs = [
    { k: 0, t: "Today" },
    { k: 1, t: "Tomorrow" },
    { k: 2, t: off >= 2 ? dayName(iso) : "Next" },
  ];
  const navBtn = "lq-btn shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-[#161827] disabled:opacity-35 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

  return (
    <Glass className="p-3.5 min-[380px]:p-4 sm:p-5">
      <div className="flex items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-[20px] sm:text-[24px] font-semibold tracking-tight leading-tight text-[#161827]">{label}</h2>
          <p className="text-[12.5px] text-[#6A6F85] mt-0.5">{fmtLong(iso)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {demo && isToday && <Badge tone="brand">Sample</Badge>}
          <Badge tone="brand">{known ? `${classes.length} ${classes.length === 1 ? "class" : "classes"}` : "…"}</Badge>
          <button
            ref={calBtn}
            type="button"
            aria-label="Open calendar"
            aria-haspopup="dialog"
            aria-expanded={calOpen}
            title="Pick a date"
            onClick={() => setCalOpen(true)}
            className="lq-btn group shrink-0 h-10 sm:h-10 min-w-10 px-0 sm:px-3.5 rounded-full flex items-center justify-center gap-2 text-[13px] font-medium text-[#161827] transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <CalendarDays className="w-[18px] h-[18px] text-[#4F46E5] transition-transform group-hover:-rotate-6" aria-hidden="true" />
            <span className="hidden sm:inline">Calendar</span>
          </button>
        </div>
      </div>

      {/* Day switcher */}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" aria-label="Previous day" disabled={off === 0} onClick={() => go(off - 1)} className={navBtn}>
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <div role="group" aria-label="Choose day" className="relative flex-1 min-w-0 grid grid-cols-3 p-1 lq-in !rounded-full">
          <span aria-hidden="true" className="lq-thumb absolute top-1 bottom-1 left-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none"
            style={{ width: "calc((100% - 8px) / 3)", transform: `translateX(${segIdx * 100}%)` }} />
          {segs.map((s) => (
            <button key={s.k} type="button" aria-pressed={segIdx === s.k}
              onClick={() => go(s.k === 2 ? Math.max(off + 1, 2) : s.k)}
              className={cx("relative z-[1] h-9 sm:h-10 min-w-0 truncate rounded-full px-1.5 text-[13px] sm:text-[14px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                segIdx === s.k ? "text-[#161827]" : "text-[#6A6F85] hover:text-[#161827]")}>
              {s.t}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Next day" disabled={off === MAX_OFF} onClick={() => go(off + 1)} className={navBtn}>
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      {/* Day strip: pages by week as you move forward */}
      <div className="mt-2.5 grid grid-cols-7 gap-1 sm:gap-1.5" role="tablist" aria-label="Pick a date">
        {strip.map((o) => {
          const d = dateAt(o), on = o === off, n = countOf(o);
          return (
            <button key={o} type="button" role="tab" aria-selected={on} onClick={() => go(o)}
              className={cx("flex flex-col items-center gap-0.5 rounded-2xl border py-1.5 min-h-[56px] text-[11px] sm:text-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                on ? SEL : "lq-btn text-[#161827]", o === 0 && !on && "!border-indigo-300")}>
              <span className={on ? "opacity-80" : "text-[#6A6F85]"}>{dayName(toIso(d))}</span>
              <span className="text-[15px] font-semibold leading-tight tabular-nums">{d.getDate()}</span>
              <span className={cx("h-1 w-1 rounded-full", n ? (on ? "bg-white" : "bg-indigo-500/60") : "bg-transparent")} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* Banners */}
      <div className="mt-3 space-y-2 empty:mt-0">
        {dayEvents.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-400/15 px-3 py-2 text-[12.5px] text-amber-900 backdrop-blur">
            <BellRing className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span><b className="font-semibold">{e.title}</b>{isToday ? (e.affectsClasses ? ". Affected classes are cancelled." : ".") : e.type ? ` (${e.type}).` : "."}</span>
          </div>
        ))}
        {isToday && note && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-500/10 px-3 py-2 text-[12.5px] text-[#A32A42]">{note}</p>}
        {isToday && ask && (
          <div role="alertdialog" aria-label="Mark a cancelled class" className="sticky top-2 z-10 rounded-2xl border border-indigo-200 bg-white/95 px-3.5 py-3 shadow-[0_12px_30px_-12px_rgba(91,82,238,0.4)]">
            <p className="text-[13.5px] text-[#161827]"><b>{ask.c.name}</b> was cancelled by a holiday or class cancel. Mark it {ask.s} anyway?</p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button type="button" className={cx(glassGhost, SEL)} onClick={() => { onMark(ask.c, ask.s, true); setAsk(null); }}>Mark {ask.s}</button>
              <button type="button" className={glassGhost} onClick={() => setAsk(null)}>Keep cancelled</button>
            </div>
          </div>
        )}
      </div>

      {/* Classes */}
      <div key={iso} className="hm-fade mt-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "pan-y" }} aria-live="polite">
        {!known ? (
          loadProblem ? (
            <div className="lq-in px-4 py-6 text-center">
              <p className="text-[14.5px] font-semibold text-[#161827]">Couldn't load {fmtShort(iso)}</p>
              <p className="text-[13px] text-[#6A6F85] mt-1">
                {status[iso] === "failed" ? "Check your connection and try again." : "The request finished but no classes came back for this day."}
              </p>
              <button type="button" onClick={retry} className={cx(glassGhost, "mt-3")}><RefreshCw className="w-4 h-4" aria-hidden="true" />Try again</button>
            </div>
          ) : (
            <ul className="space-y-2" aria-busy="true" aria-label={`Loading ${fmtShort(iso)}`}>
              {[0, 1, 2].map((i) => <li key={i} className="lq-in h-[64px] animate-pulse" style={{ opacity: 1 - i * 0.2 }} />)}
            </ul>
          )
        ) : classes.length ? (
          <ul className="space-y-2">
            {classes.map((c) => <ClassRow key={c.id} c={c} next={c.id === nextId} onPick={pick} readOnly={!isToday} />)}
          </ul>
        ) : (
          <div className="lq-in px-4 py-6 text-center">
            <p className="text-[14.5px] font-semibold text-[#161827]">{isToday ? "No classes today" : `No classes ${off === 1 ? "tomorrow" : "on " + dayName(iso, "long")}`}</p>
            <p className="text-[13px] text-[#6A6F85] mt-1">
              {isToday && today.nextDay ? `Next classes: ${fmtLong(today.nextDay.date)}, ${today.nextDay.classCount} scheduled.` : "Enjoy the free day."}
            </p>
          </div>
        )}
      </div>

      <p className="text-[11.5px] text-[#6A6F85] mt-2.5 px-1">
        {isToday
          ? (demo ? "Tap a button and watch your attendance move." : "Tap the same button again to clear a mark.")
          : "Marking opens on the day itself. Swipe to change day."}
      </p>

      {calOpen && <CalendarSheet base={base} off={off} events={events} onPick={pickFromCal} onClose={closeCal} />}
    </Glass>
  );
}