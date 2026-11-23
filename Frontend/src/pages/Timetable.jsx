import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, LayoutGrid, ListTodo, Lock, MapPin, Settings2, User } from "lucide-react";
import { occurrencesApi, errMsg } from "../api/endpoints";
import { addDays, dayLabel } from "../lib/dates";
import { dayNum } from "../lib/dateui";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, cx } from "../components/Ui";
import { FadeIn, Skeleton, Tabs } from "../components/Ux";
import RulesPanel from "./timetable/RulesPanel";
import "../styles/tones";

/* ---------- constants & helpers ---------- */

const VIEWS = [
  { key: "day", label: "Day", icon: ListTodo },
  { key: "week", label: "Week", icon: LayoutGrid },
  { key: "rules", label: "Weekly classes", icon: Settings2 },
];

// Every status is a tone (see styles/tones.js), so it looks right in light and dark mode.
const STATUS = {
  present: { label: "Present", tone: "ok" },
  absent: { label: "Absent", tone: "bad" },
  excused: { label: "Excused", tone: "info" },
  cancelled: { label: "Cancelled", tone: "mute" },
  pending: { label: "Not marked", tone: "warn" },
};
const statusOf = (s) => STATUS[s] || (s ? { label: s, tone: "mute" } : STATUS.pending);

const LOCKS = {
  official_cancellation: "Cancelled by your CR",
  cancelled_by_cause: "Cancelled by a calendar event",
  outside_range: "Outside semester",
};

const FOCUS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)]";

const weekdayShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const toMin = (t) => {
  const [h, m] = String(t || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const duration = (a, b) => {
  const m = toMin(b) - toMin(a);
  if (m <= 0) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
};
const sortClasses = (list = []) => [...list].sort((a, b) => toMin(a.plannedStartTime) - toMin(b.plannedStartTime));
const colorOf = (c) => c.subject?.color || "#6366F1";
const countText = (n) => `${n} class${n === 1 ? "" : "es"}`;

/* ---------- day strip ---------- */

const DayStrip = ({ days, selected, onSelect }) => (
  <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Days of the week">
    {days.map((d) => {
      const on = d.date === selected;
      const dots = (d.classes || []).slice(0, 4);
      return (
        <button
          key={d.date}
          role="tab"
          aria-selected={on}
          onClick={() => onSelect(d.date)}
          className={cx(
            "relative flex flex-col items-center gap-0.5 rounded-2xl py-2.5 sm:py-3 border transition-colors active:scale-[0.98] motion-reduce:transition-none",
            FOCUS,
            on
              ? "ac-bg border-transparent text-white shadow-sm"
              : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--ink)] hover:border-[color:var(--line-strong)]",
            d.isToday && !on && "ring-2 ring-indigo-400/50"
          )}
        >
          <span className={cx("text-[11px] sm:text-[12px] font-medium", on ? "text-white/85" : "text-[color:var(--muted)]")}>{weekdayShort(d.date)}</span>
          <span className="text-[18px] sm:text-[20px] font-semibold leading-none tabular-nums">{dayNum(d.date)}</span>
          <span className="flex items-center justify-center gap-[3px] h-2 mt-1">
            {dots.length === 0 ? (
              <span className={cx("w-1 h-1 rounded-full", on ? "bg-white/40" : "bg-[color:var(--line-strong)]")} />
            ) : (
              dots.map((c, i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "#fff" : colorOf(c) }} />)
            )}
          </span>
        </button>
      );
    })}
  </div>
);

/* ---------- a class in the day timeline ---------- */

const ClassRow = ({ c, tag }) => {
  const st = statusOf(c.status);
  const lock = LOCKS[c.lock];
  const cancelled = c.status === "cancelled" || c.lock === "official_cancellation";
  const color = colorOf(c);

  return (
    <div className="flex gap-2.5 sm:gap-4">
      <div className="w-12 sm:w-16 shrink-0 pt-4 text-right">
        <p className="text-[14.5px] font-semibold text-[color:var(--ink)] leading-none tabular-nums">{c.plannedStartTime}</p>
        <p className="text-[12px] text-[color:var(--muted)] mt-1 tabular-nums">{c.plannedEndTime}</p>
      </div>

      <Card
        className={cx(
          "relative flex-1 overflow-hidden p-0 min-w-0",
          tag === "now" && "tn tn-brand !border-[color:var(--tn-solid)] !bg-[color:var(--tn-bg)]",
          cancelled && "opacity-70"
        )}
      >
        <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1" style={{ background: color }} />
        <div className="pl-4 sm:pl-5 pr-3.5 sm:pr-4 py-3.5 sm:py-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cx("text-[16px] font-semibold text-[color:var(--ink)]", cancelled && "line-through decoration-[color:var(--faint)]")}>{c.subject?.name || "Class"}</p>
              {tag === "now" && <Badge tone="brand">Happening now</Badge>}
              {tag === "next" && <Badge tone="green">Up next</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[color:var(--muted)] mt-1.5">
              <span>{duration(c.plannedStartTime, c.plannedEndTime)}</span>
              {c.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" aria-hidden="true" />{c.room}</span>}
              {c.professor && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />{c.professor}</span>}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {c.classType && <Badge>{c.classType}</Badge>}
              {c.group && <Badge tone="brand">{c.group}</Badge>}
              {c.oneOff && <Badge tone="amber">Extra class</Badge>}
              {c.attendanceUnits > 1 && <Badge>{c.attendanceUnits} units</Badge>}
              {lock && <Badge tone="red"><Lock className="w-3 h-3 mr-1" aria-hidden="true" />{lock}</Badge>}
            </div>
          </div>

          <span className={cx("tn tn-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium shrink-0", `tn-${st.tone}`)}>
            <span className={cx("tn tn-dot w-1.5 h-1.5 rounded-full", `tn-${st.tone}`)} aria-hidden="true" />
            {st.label}
          </span>
        </div>
      </Card>
    </div>
  );
};

/* ---------- page ---------- */

const Timetable = () => {
  const { setup } = useOutletContext();
  const [params, setParams] = useSearchParams();

  // The open view lives in the URL (?view=week) so a refresh keeps it.
  const wanted = params.get("view");
  const view = VIEWS.some((v) => v.key === wanted) ? wanted : "day";
  const setView = (key) => setParams({ view: key }, { replace: true });

  const [date, setDate] = useState(null); // null = the current week
  const [week, setWeek] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pendingDay = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setWeek(await occurrencesApi.week(setup._id, date));
    } catch (e) {
      setError(errMsg(e, "Could not load the week"));
    } finally {
      setLoading(false);
    }
  }, [setup._id, date]);

  useEffect(() => {
    if (view !== "rules") load();
  }, [load, view]);

  // Choose which day is open whenever a week arrives
  useEffect(() => {
    if (!week?.days?.length) return;
    const dates = week.days.map((d) => d.date);
    if (pendingDay.current && dates.includes(pendingDay.current)) {
      setSelected(pendingDay.current);
      pendingDay.current = null;
      return;
    }
    setSelected((prev) => (prev && dates.includes(prev) ? prev : week.days.find((d) => d.isToday)?.date || week.days.find((d) => d.count > 0)?.date || dates[0]));
  }, [week]);

  const goWeek = (delta) => week && setDate(addDays(week.weekStart, delta * 7));

  const goDay = (delta) => {
    if (!selected || !week) return;
    const next = addDays(selected, delta);
    if (week.days.some((d) => d.date === next)) setSelected(next);
    else {
      pendingDay.current = next;
      setDate(next);
    }
  };

  const openDay = (iso) => {
    setSelected(iso);
    setView("day");
  };

  const stats = useMemo(() => {
    const all = (week?.days || []).flatMap((d) => d.classes || []);
    const count = (s) => all.filter((c) => c.status === s).length;
    const cancelled = count("cancelled");
    const present = count("present");
    const absent = count("absent");
    const excused = count("excused");
    const actionable = all.length - cancelled;
    const marked = present + absent + excused;
    return { total: all.length, present, absent, toMark: Math.max(0, actionable - marked), pct: actionable ? Math.round((marked / actionable) * 100) : 0 };
  }, [week]);

  const day = week?.days?.find((d) => d.date === selected);
  const dayClasses = useMemo(() => sortClasses(day?.classes), [day]);

  // "Happening now" / "Up next" only make sense for today
  const tags = useMemo(() => {
    const out = {};
    if (!day?.isToday) return out;
    const n = nowMin();
    const live = dayClasses.find((c) => toMin(c.plannedStartTime) <= n && n < toMin(c.plannedEndTime));
    if (live) out[live.id] = "now";
    const next = dayClasses.find((c) => toMin(c.plannedStartTime) > n);
    if (next) out[next.id] = "next";
    return out;
  }, [day, dayClasses]);

  const weekEmpty = week && week.days.every((d) => !d.classes?.length);

  const summary = [
    { label: "Classes", value: stats.total, tone: null },
    { label: "Present", value: stats.present, tone: "ok" },
    { label: "Absent", value: stats.absent, tone: "bad" },
    { label: "To mark", value: stats.toMark, tone: "warn" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-3 min-[380px]:px-3.5 sm:px-6 py-6 sm:py-10">
      <PageHeader title="Timetable" subtitle="Your week at a glance. Tap a day to see its classes." />

      <Tabs className="mb-4 sm:mb-5" value={view} onChange={setView} items={VIEWS} />

      {view === "rules" && (
        <FadeIn>
          <RulesPanel setup={setup} onChanged={() => setWeek(null)} />
        </FadeIn>
      )}

      {view !== "rules" && (
        <div className="space-y-3 sm:space-y-4">
          {/* week navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="glass" size="sm" onClick={() => goWeek(-1)} disabled={!week} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-[14.5px] font-semibold text-[color:var(--ink)] px-1.5 min-w-[150px] text-center tabular-nums">
                {week ? `${dayLabel(week.weekStart)} – ${dayLabel(week.weekEnd)}` : "Loading…"}
              </span>
              <Button variant="glass" size="sm" onClick={() => goWeek(1)} disabled={!week} aria-label="Next week"><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDate(null)}><CalendarDays className="w-4 h-4" />This week</Button>
          </div>

          <Alert type="error">{error}</Alert>

          {loading && !week ? (
            <div className="space-y-2.5 sm:space-y-4" aria-busy="true">
              <Skeleton className="h-[120px] rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : !week ? null : weekEmpty ? (
            <EmptyState
              icon={CalendarPlus}
              title="No classes this week"
              text="Either it is a break, or you have not added your weekly classes yet. Add them once and every week is filled in for you."
              action={<Button onClick={() => setView("rules")}><Settings2 className="w-4 h-4" />Set up weekly classes</Button>}
            />
          ) : (
            <>
              {/* progress summary */}
              <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {summary.map((s) => (
                    <div key={s.label} className="rounded-xl bg-[color:var(--inset)] px-3.5 py-3">
                      <p className={cx("text-[24px] font-semibold leading-none tabular-nums", s.tone ? `tn tn-${s.tone} tn-text` : "text-[color:var(--ink)]")}>{s.value}</p>
                      <p className="text-[12px] text-[color:var(--muted)] mt-1.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div
                    className="h-1.5 rounded-full bg-[color:var(--track)] overflow-hidden"
                    role="progressbar"
                    aria-label="Share of this week's classes marked"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={stats.pct}
                  >
                    <div className="h-full rounded-full ac-bg transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${stats.pct}%` }} />
                  </div>
                  <p className="text-[12px] text-[color:var(--muted)] mt-1.5 tabular-nums">{stats.pct}% of this week marked</p>
                </div>
              </Card>

              {/* DAY VIEW */}
              {view === "day" && (
                <FadeIn className="space-y-3 sm:space-y-4">
                  <DayStrip days={week.days} selected={selected} onSelect={setSelected} />

                  {day && (
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-[18px] sm:text-[19px] font-semibold tracking-tight text-[color:var(--ink)] flex items-center gap-2">
                            {dayLabel(day.date, true)}
                            {day.isToday && <Badge tone="brand">Today</Badge>}
                          </h2>
                          <p className="text-[13px] text-[color:var(--muted)] mt-0.5 tabular-nums">{dayClasses.length ? countText(dayClasses.length) : "Nothing scheduled"}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button variant="glass" size="sm" onClick={() => goDay(-1)} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></Button>
                          <Button variant="glass" size="sm" onClick={() => goDay(1)} aria-label="Next day"><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>

                      {dayClasses.length === 0 ? (
                        <Card className="p-6 sm:p-8 text-center">
                          <span className="tn tn-brand tn-soft mx-auto w-12 h-12 rounded-xl flex items-center justify-center"><CalendarDays className="w-6 h-6" aria-hidden="true" /></span>
                          <p className="text-[15.5px] font-semibold text-[color:var(--ink)] mt-3">A free day</p>
                          <p className="text-[13.5px] text-[color:var(--muted)] mt-1">No classes here. Use the arrows or the strip above to look at another day.</p>
                        </Card>
                      ) : (
                        <div className="space-y-2.5 sm:space-y-3">
                          {dayClasses.map((c, i) => (
                            <FadeIn key={c.id} delay={Math.min(i, 6) * 45}>
                              <ClassRow c={c} tag={tags[c.id]} />
                            </FadeIn>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </FadeIn>
              )}

              {/* WEEK VIEW */}
              {view === "week" && (
                <FadeIn>
                  <div className="grid md:grid-cols-2 gap-2.5 sm:gap-4">
                    {week.days.map((d, i) => {
                      const list = sortClasses(d.classes);
                      return (
                        <FadeIn key={d.date} delay={i * 40}>
                          <Card className={cx("p-0 overflow-hidden h-full", d.isToday && "tn tn-brand !border-[color:var(--tn-solid)]")}>
                            <button
                              onClick={() => openDay(d.date)}
                              className={cx(
                                "w-full flex items-center justify-between px-4 sm:px-5 py-3.5 text-left bg-[color:var(--inset)] hover:bg-[color:var(--line-soft)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                              )}
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="text-[15px] font-semibold text-[color:var(--ink)]">{dayLabel(d.date)}</span>
                                {d.isToday && <Badge tone="brand">Today</Badge>}
                              </span>
                              <span className="flex items-center gap-1 text-[12.5px] text-[color:var(--muted)] tabular-nums">
                                {countText(list.length)}<ChevronRight className="w-4 h-4" aria-hidden="true" />
                              </span>
                            </button>

                            {list.length ? (
                              <ul className="px-4 sm:px-5 py-3.5 space-y-2.5">
                                {list.map((c) => {
                                  const st = statusOf(c.status);
                                  return (
                                    <li key={c.id} className="flex items-center gap-3">
                                      <span className="w-1 h-8 rounded-full shrink-0" style={{ background: colorOf(c) }} />
                                      <span className="text-[12.5px] text-[color:var(--muted)] w-[88px] shrink-0 tabular-nums">{c.plannedStartTime}–{c.plannedEndTime}</span>
                                      <span className={cx("text-[14px] text-[color:var(--ink)] truncate flex-1", c.status === "cancelled" && "line-through decoration-[color:var(--faint)] opacity-70")}>{c.subject?.name}</span>
                                      {c.group && <Badge tone="brand">{c.group}</Badge>}
                                      <span className={cx("tn tn-dot w-2.5 h-2.5 rounded-full shrink-0", `tn-${st.tone}`)} title={st.label} />
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="px-4 sm:px-5 py-4 text-[13.5px] text-[color:var(--muted)]">No classes</p>
                            )}
                          </Card>
                        </FadeIn>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 px-1 text-[12.5px] text-[color:var(--muted)]">
                    {["present", "absent", "excused", "cancelled", "pending"].map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5">
                        <span className={cx("tn tn-dot w-2.5 h-2.5 rounded-full", `tn-${STATUS[k].tone}`)} />{STATUS[k].label}
                      </span>
                    ))}
                  </div>
                </FadeIn>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Timetable;