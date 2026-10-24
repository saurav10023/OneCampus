import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { occurrencesApi, errMsg } from "../api/endpoints";
import { addDays, dayLabel } from "../lib/dates";
import { Alert, Badge, Button, Card, PageHeader, PageSpinner, cx } from "../components/Ui";
import RulesPanel from "./timetable/RulesPanel";

const dot = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  excused: "bg-sky-500",
  cancelled: "bg-slate-400",
  pending: "bg-amber-400",
};

const Timetable = () => {
  const { setup } = useOutletContext();
  const [tab, setTab] = useState("week");
  const [date, setDate] = useState(null);
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    if (tab === "week") load();
  }, [load, tab]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader title="Timetable" subtitle="Your weekly classes, and the recurring slots that generate them." />

      <div className="flex gap-1.5 p-1.5 rounded-full bg-white/45 border border-white/70 w-fit mb-6">
        {[{ k: "week", l: "This week" }, { k: "rules", l: "Weekly classes" }].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={cx(
              "h-9 px-4 rounded-full text-[13.5px] font-medium transition",
              tab === t.k ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25" : "text-[#161827]/70 hover:bg-white/70"
            )}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "rules" && <RulesPanel setup={setup} onChanged={() => setWeek(null)} />}

      {tab === "week" && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button variant="glass" size="sm" onClick={() => week && setDate(addDays(week.weekStart, -7))} aria-label="Previous week"><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-[14px] font-medium text-[#161827] px-2">
              {week ? `${dayLabel(week.weekStart)} – ${dayLabel(week.weekEnd)}` : "…"}
            </span>
            <Button variant="glass" size="sm" onClick={() => week && setDate(addDays(week.weekStart, 7))} aria-label="Next week"><ChevronRight className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(null)}>This week</Button>
            {week && <Badge>{week.totalClasses} classes</Badge>}
          </div>

          <Alert type="error" className="mb-4">{error}</Alert>

          {loading && !week ? (
            <PageSpinner />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {(week?.days || []).map((d) => (
                <Card key={d.date} className={cx("p-5", d.isToday && "ring-2 ring-indigo-300")}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[15px] font-semibold text-[#161827]">{dayLabel(d.date)}</p>
                    {d.isToday ? <Badge tone="brand">Today</Badge> : <span className="text-[12.5px] text-[#6A6F85]">{d.count} classes</span>}
                  </div>
                  {d.classes?.length ? (
                    <ul className="space-y-2.5">
                      {d.classes.map((c) => (
                        <li key={c.id} className="flex items-center gap-3">
                          <span className={cx("w-2.5 h-2.5 rounded-full shrink-0", dot[c.status] || "bg-slate-300")} title={c.status} />
                          <span className="text-[12.5px] text-[#6A6F85] w-[84px] shrink-0">{c.plannedStartTime}–{c.plannedEndTime}</span>
                          <span className="text-[14px] text-[#161827] truncate">{c.subject?.name}</span>
                          {c.group && <Badge tone="brand">{c.group}</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13.5px] text-[#6A6F85]">No classes</p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Timetable;