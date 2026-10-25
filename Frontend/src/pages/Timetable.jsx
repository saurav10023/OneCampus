import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, LayoutGrid, ListTodo, Lock, MapPin, Settings2, User } from "lucide-react";
import { occurrencesApi, errMsg } from "../api/endpoints";
import { addDays, dayLabel } from "../lib/dates";
import { dayNum } from "../lib/dateui";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, cx } from "../components/Ui";
import { FadeIn, Skeleton, Tabs } from "../components/Ux";
import RulesPanel from "./timetable/RulesPanel";

/* ---------- constants & helpers ---------- */

const VIEWS = [
  { key: "day", label: "Day", icon: ListTodo },
  { key: "week", label: "Week", icon: LayoutGrid },
  { key: "rules", label: "Weekly classes", icon: Settings2 },
];

const STATUS = {
  present: { label: "Present", pill: "bg-emerald-500/12 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  absent: { label: "Absent", pill: "bg-rose-500/12 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  excused: { label: "Excused", pill: "bg-sky-500/12 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  cancelled: { label: "Cancelled", pill: "bg-slate-500/12 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  pending: { label: "Not marked", pill: "bg-amber-500/12 text-amber-700 border-amber-200", dot: "bg-amber-400" },
};
const statusOf = (s) => STATUS[s] || (s ? { label: s, pill: "bg-slate-500/10 text-slate-600 border-slate-200", dot: "bg-slate-400" } : STATUS.pending);

const LOCKS = {
  official_cancellation: "Cancelled by your CR",
  cancelled_by_cause: "Cancelled by a calendar event",
  outside_range: "Outside semester",
};

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
            "relative flex flex-col items-center gap-0.5 rounded-2xl py-2.5 sm:py-3 border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
            on
              ? "text-white bg-gradient-to-b from-[#5B52EE] to-[#2B8DE0] border-transparent shadow-lg shadow-indigo-500/30 -translate-y-0.5"
              : "bg-white/55 border-white/80 text-[#161827] hover:bg-white/85",
            d.isToday && !on && "ring-2 ring-indigo-300"
          )}
        >
          <span className={cx("text-[10.5px] sm:text-[11px] font-semibold uppercase tracking-wider", on ? "text-white/80" : "text-[#6A6F85]")}>{weekdayShort(d.date)}</span>
          <span className="text-[18px] sm:text-[20px] font-semibold leading-none">{dayNum(d.date)}</span>
          <span className="flex items-center justify-center gap-[3px] h-2 mt-1">
            {dots.length === 0 ? (
              <span className={cx("w-1 h-1 rounded-full", on ? "bg-white/40" : "bg-[#161827]/15")} />
            ) : (
              dots.map((c, i) => <span key={i} className="w-1.5 h-1.5 rounded-full ring-1 ring-white/70" style={{ background: on ? "#fff" : colorOf(c) }} />)
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
    <div className="flex gap-3 sm:gap-4">
      <div className="w-14 sm:w-16 shrink-0 pt-4 text-right">
        <p className="text-[14.5px] font-semibold text-[#161827] leading-none">{c.plannedStartTime}</p>
        <p className="text-[12px] text-[#6A6F85] mt-1">{c.plannedEndTime}</p>
      </div>

      <Card className={cx("relative flex-1 overflow-hidden p-0 hover:shadow-[0_24px_48px_-28px_rgba(30,32,70,0.4)] transition-shadow", tag === "now" && "ring-2 ring-indigo-300", cancelled && "opacity-70")}>
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: color }} />
        <div className="pl-5 pr-4 py-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cx("text-[16px] font-semibold text-[#161827]", cancelled && "line-through decoration-[#161827]/30")}>{c.subject?.name || "Class"}</p>
              {tag === "now" && <Badge tone="brand">Happening now</Badge>}
              {tag === "next" && <Badge tone="green">Up next</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#6A6F85] mt-1.5">
              <span>{duration(c.plannedStartTime, c.plannedEndTime)}</span>
              {c.room && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{c.room}</span>}
              {c.professor && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{c.professor}</span>}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {c.classType && <Badge>{c.classType}</Badge>}
              {c.group && <Badge tone="brand">{c.group}</Badge>}
              {c.oneOff && <Badge tone="amber">Extra class</Badge>}
              {c.attendanceUnits > 1 && <Badge>{c.attendanceUnits} units</Badge>}
              {lock && <Badge tone="red"><Lock className="w-3 h-3 mr-1" />{lock}</Badge>}
            </div>
          </div>

          <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium shrink-0", st.pill)}>
            <span className={cx("w-1.5 h-1.5 rounded-full", st.dot)} />
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader title="Timetable" subtitle="Your week at a glance. Tap a day to see its classes." />

      <Tabs className="mb-6" value={view} onChange={setView} items={VIEWS} />

      {view === "rules" && (
        <FadeIn>
          <RulesPanel setup={setup} onChanged={() => setWeek(null)} />
        </FadeIn>
      )}

      {view !== "rules" && (
        <div className="space-y-5">
          {/* week navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="glass" size="sm" onClick={() => goWeek(-1)} disabled={!week} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-[14.5px] font-semibold text-[#161827] px-1.5 min-w-[150px] text-center">
                {week ? `${dayLabel(week.weekStart)} – ${dayLabel(week.weekEnd)}` : "Loading…"}
              </span>
              <Button variant="glass" size="sm" onClick={() => goWeek(1)} disabled={!week} aria-label="Next week"><ChevronRight className="w-4 h-4" /></Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDate(null)}><CalendarDays className="w-4 h-4" />This week</Button>
          </div>

          <Alert type="error">{error}</Alert>

          {loading && !week ? (
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-[88px] rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
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
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="flex flex-wrap gap-x-7 gap-y-2">
                    {[
                      { label: "Classes", value: stats.total, cls: "text-[#161827]" },
                      { label: "Present", value: stats.present, cls: "text-emerald-600" },
                      { label: "Absent", value: stats.absent, cls: "text-rose-600" },
                      { label: "To mark", value: stats.toMark, cls: "text-amber-600" },
                    ].map((s) => (
                      <div key={s.label}>
                        <p className={cx("text-[24px] font-semibold leading-none", s.cls)}>{s.value}</p>
                        <p className="text-[12px] text-[#6A6F85] mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="w-full sm:w-56">
                    <div className="h-2 rounded-full bg-[#161827]/10 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] transition-all duration-700" style={{ width: `${stats.pct}%` }} />
                    </div>
                    <p className="text-[12px] text-[#6A6F85] mt-1.5">{stats.pct}% of this week marked</p>
                  </div>
                </div>
              </Card>

              {/* DAY VIEW */}
              {view === "day" && (
                <FadeIn className="space-y-5">
                  <DayStrip days={week.days} selected={selected} onSelect={setSelected} />

                  {day && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="text-[19px] font-semibold tracking-tight text-[#161827] flex items-center gap-2">
                            {dayLabel(day.date, true)}
                            {day.isToday && <Badge tone="brand">Today</Badge>}
                          </h2>
                          <p className="text-[13px] text-[#6A6F85] mt-0.5">{dayClasses.length ? `${dayClasses.length} class${dayClasses.length === 1 ? "" : "es"}` : "Nothing scheduled"}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button variant="glass" size="sm" onClick={() => goDay(-1)} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></Button>
                          <Button variant="glass" size="sm" onClick={() => goDay(1)} aria-label="Next day"><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>

                      {dayClasses.length === 0 ? (
                        <Card className="p-8 text-center">
                          <span className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center"><CalendarDays className="w-6 h-6" /></span>
                          <p className="text-[15.5px] font-semibold text-[#161827] mt-3">A free day</p>
                          <p className="text-[13.5px] text-[#6A6F85] mt-1">No classes here. Use the arrows or the strip above to look at another day.</p>
                        </Card>
                      ) : (
                        <div className="space-y-3">
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
                  <div className="grid md:grid-cols-2 gap-4">
                    {week.days.map((d, i) => {
                      const list = sortClasses(d.classes);
                      return (
                        <FadeIn key={d.date} delay={i * 40}>
                          <Card className={cx("p-0 overflow-hidden h-full", d.isToday && "ring-2 ring-indigo-300")}>
                            <button
                              onClick={() => openDay(d.date)}
                              className="w-full flex items-center justify-between px-5 py-3.5 text-left bg-white/40 hover:bg-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50"
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="text-[15px] font-semibold text-[#161827]">{dayLabel(d.date)}</span>
                                {d.isToday && <Badge tone="brand">Today</Badge>}
                              </span>
                              <span className="flex items-center gap-1 text-[12.5px] text-[#6A6F85]">
                                {list.length} class{list.length === 1 ? "" : "es"}<ChevronRight className="w-4 h-4" />
                              </span>
                            </button>

                            {list.length ? (
                              <ul className="px-5 py-3.5 space-y-2.5">
                                {list.map((c) => {
                                  const st = statusOf(c.status);
                                  return (
                                    <li key={c.id} className="flex items-center gap-3">
                                      <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: colorOf(c) }} />
                                      <span className="text-[12.5px] text-[#6A6F85] w-[88px] shrink-0">{c.plannedStartTime}–{c.plannedEndTime}</span>
                                      <span className={cx("text-[14px] text-[#161827] truncate flex-1", c.status === "cancelled" && "line-through decoration-[#161827]/30 opacity-70")}>{c.subject?.name}</span>
                                      {c.group && <Badge tone="brand">{c.group}</Badge>}
                                      <span className={cx("w-2.5 h-2.5 rounded-full shrink-0", st.dot)} title={st.label} />
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p className="px-5 py-4 text-[13.5px] text-[#6A6F85]">No classes</p>
                            )}
                          </Card>
                        </FadeIn>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 px-1 text-[12.5px] text-[#6A6F85]">
                    {["present", "absent", "excused", "cancelled", "pending"].map((k) => (
                      <span key={k} className="inline-flex items-center gap-1.5">
                        <span className={cx("w-2.5 h-2.5 rounded-full", STATUS[k].dot)} />{STATUS[k].label}
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