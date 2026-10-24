import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { occurrencesApi, attendanceApi, errMsg } from "../api/endpoints";
import { overallOf } from "../lib/attendance";
import { addDays, dayLabel } from "../lib/dates";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, PageSpinner, ProgressBar, cx } from "../components/Ui";

const STATUSES = [
  { key: "present", label: "Present", on: "bg-emerald-500 text-white border-emerald-500" },
  { key: "absent", label: "Absent", on: "bg-rose-500 text-white border-rose-500" },
  { key: "excused", label: "Excused", on: "bg-sky-500 text-white border-sky-500" },
  { key: "cancelled", label: "Cancelled", on: "bg-slate-500 text-white border-slate-500" },
];

const LOCKS = {
  official_cancellation: { text: "Cancelled by your CR", tone: "red" },
  cancelled_by_cause: { text: "Cancelled by a calendar event", tone: "amber" },
  outside_range: { text: "Outside semester", tone: "neutral" },
};

const Dashboard = () => {
  const { setup } = useOutletContext();
  const setupId = setup._id;

  const [date, setDate] = useState(null); // null = today in the setup's timezone
  const [day, setDay] = useState(null);
  const [overall, setOverall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, o] = await Promise.allSettled([occurrencesApi.today(setupId, date), attendanceApi.overview(setupId)]);
      if (d.status === "fulfilled") setDay(d.value);
      else setError(errMsg(d.reason, "Could not load classes"));
      if (o.status === "fulfilled") setOverall(overallOf(o.value));
    } finally {
      setLoading(false);
    }
  }, [setupId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const mark = async (c, status) => {
    if (c.lock === "official_cancellation" || c.lock === "outside_range") return;
    let override = false;
    if (c.lock === "cancelled_by_cause") {
      if (!window.confirm("This class was cancelled by one of your calendar events. Mark it anyway?")) return;
      override = true;
    }
    setBusyId(c.id);
    setError("");
    try {
      if (c.status === status) await occurrencesApi.clear(setupId, c.id);
      else await occurrencesApi.mark(setupId, c.id, status, override);
      await load();
    } catch (e) {
      setError(errMsg(e, "Could not update attendance"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && !day) return <PageSpinner />;

  const shown = day?.date || date;
  const target = setup.targetPercentage;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader title={day?.isToday ? "Today" : dayLabel(shown, true)} subtitle={`${setup.name} · ${[setup.branch, setup.section].filter(Boolean).join(" ")}`} />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* date navigation */}
          <div className="flex items-center gap-2">
            <Button variant="glass" size="sm" onClick={() => setDate(addDays(shown, -1))} aria-label="Previous day"><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-[14px] font-medium text-[#161827] px-2">{dayLabel(shown, true)}</span>
            <Button variant="glass" size="sm" onClick={() => setDate(addDays(shown, 1))} aria-label="Next day"><ChevronRight className="w-4 h-4" /></Button>
            {!day?.isToday && <Button variant="ghost" size="sm" onClick={() => setDate(null)}>Back to today</Button>}
          </div>

          <Alert type="error">{error}</Alert>
          {day && day.isWithinSetup === false && <Alert type="warning">This date is outside your semester dates, so classes here are not counted.</Alert>}

          {day?.nextClass && (
            <Card className="p-4 flex items-center gap-3 bg-indigo-500/10 border-indigo-200">
              <CalendarClock className="w-5 h-5 text-indigo-600 shrink-0" />
              <p className="text-[14px] text-[#161827]">
                Next up: <span className="font-semibold">{day.nextClass.subject?.name || day.nextClass.subjectName || "class"}</span>
                {day.nextClass.plannedStartTime && ` at ${day.nextClass.plannedStartTime}`}
              </p>
            </Card>
          )}

          {(day?.events || []).map((ev) => (
            <Alert key={ev._id || ev.id || ev.title} type="info">
              <span className="font-semibold">{ev.title}</span> {ev.type && `· ${ev.type}`}
            </Alert>
          ))}

          {day?.classes?.length ? (
            day.classes.map((c) => {
              const lock = LOCKS[c.lock];
              const locked = c.lock === "official_cancellation" || c.lock === "outside_range";
              return (
                <Card key={c.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: c.subject?.color || "#6366F1" }} />
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-[#161827] truncate">{c.subject?.name || "Class"}</p>
                        <p className="text-[13px] text-[#6A6F85] mt-0.5">
                          {c.plannedStartTime}–{c.plannedEndTime}
                          {c.attendanceUnits > 1 && ` · ${c.attendanceUnits} units`}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.classType && <Badge>{c.classType}</Badge>}
                          {c.group && <Badge tone="brand">{c.group}</Badge>}
                          {c.oneOff && <Badge tone="amber">Extra class</Badge>}
                          {lock && <Badge tone={lock.tone}><Lock className="w-3 h-3 mr-1" />{lock.text}</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {STATUSES.map((s) => (
                      <button
                        key={s.key}
                        disabled={locked || busyId === c.id}
                        onClick={() => mark(c, s.key)}
                        className={cx(
                          "h-9 px-4 rounded-full text-[13px] font-medium border transition disabled:opacity-50 disabled:cursor-not-allowed",
                          c.status === s.key ? s.on : "bg-white/60 border-white/80 text-[#161827]/75 hover:bg-white/90"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="No classes this day"
              text={day?.nextDay ? `Next class day: ${dayLabel(day.nextDay.date)} (${day.nextDay.classCount} classes).` : "Enjoy the free time, or add weekly classes in your timetable."}
              action={
                day?.nextDay ? (
                  <Button variant="glass" onClick={() => setDate(day.nextDay.date)}>Go to {dayLabel(day.nextDay.date)}</Button>
                ) : (
                  <Link to="/timetable"><Button>Open timetable</Button></Link>
                )
              }
            />
          )}
        </div>

        {/* right column */}
        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85]">Overall attendance</p>
            {overall?.pct != null ? (
              <>
                <p className="text-[38px] font-semibold text-[#161827] leading-none mt-2">{overall.pct}%</p>
                <div className="mt-3"><ProgressBar value={overall.pct} target={target} /></div>
                <p className="text-[12.5px] text-[#6A6F85] mt-2">
                  {overall.attended} of {overall.held} classes · target {target}%
                </p>
              </>
            ) : (
              <p className="text-[14px] text-[#6A6F85] mt-2">Mark a few classes to see your percentage.</p>
            )}
            <Link to="/attendance" className="inline-block mt-4"><Button variant="glass" size="sm">Subject breakdown</Button></Link>
          </Card>

          {day?.summary && Object.keys(day.summary).length > 0 && (
            <Card className="p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6A6F85] mb-3">This day</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(day.summary).map(([k, v]) => (
                  <Badge key={k}>{v} {k}</Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;