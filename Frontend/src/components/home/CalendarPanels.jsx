import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCheck, X } from "lucide-react";
import { Badge, cx } from "../Ui";
import { Card, ROUTES, Title, dayName, fmtLong, fmtShort, ghost, local, tone } from "./Shared";

const Mark = ({ st }) => st === "present" ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Present" /> : st === "absent" ? <X className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Absent" /> : null;

/* 5 / 6 (part a): This week. Day tabs on phones, 7-column grid on desktop. */
export function WeekCard({ week, demo }) {
  const [sel, setSel] = useState(() => (week.find((d) => d.isToday) || week[0]).date);
  const day = week.find((d) => d.date === sel) || week[0];
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.attendance} className="text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Timetable</Link>}>This week</Title>

      <div className="lg:hidden">
        <div role="tablist" aria-label="Pick a day" className="grid grid-cols-7 gap-1">
          {week.map((d) => (
            <button key={d.date} type="button" role="tab" aria-selected={d.date === sel} onClick={() => setSel(d.date)}
              className={cx("flex flex-col items-center gap-0.5 rounded-2xl border py-1.5 min-h-[56px] text-[11.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50", d.date === sel ? "lg-on" : "lg-pill text-[#161827]", d.isToday && d.date !== sel && "!border-[#161827]/25")}>
              <span className="opacity-80">{dayName(d.date)}</span>
              <span className="text-[15px] font-semibold leading-tight">{local(d.date).getDate()}</span>
              <span className="flex gap-0.5 h-1.5 items-center">{d.classes.slice(0, 4).map((c) => <i key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ background: d.date === sel ? "#fff" : c.color }} />)}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-[#161827] mt-3 mb-2">{fmtLong(day.date)}{day.isToday ? " (today)" : ""}</p>
        {day.classes.length ? (
          <ul className="space-y-1.5">
            {day.classes.map((c) => (
              <li key={c.id} className="relative lg-in flex items-center gap-3 pl-5 pr-3 py-2.5 overflow-hidden">
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c.color }} />
                <span className="w-11 text-[13px] font-semibold tabular-nums text-[#161827]">{c.start}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#161827]", c.status === "cancelled" && "line-through opacity-60")}>{c.name || c.code}</span>
                {c.status === "cancelled" ? <Badge tone="red">Cancelled</Badge> : <Mark st={c.status} />}
              </li>
            ))}
          </ul>
        ) : <p className="lg-in px-4 py-5 text-center text-[13.5px] text-[#6A6F85]">No classes this day.</p>}
      </div>

      <div className="hidden lg:grid grid-cols-7 gap-2">
        {week.map((d) => (
          <div key={d.date} className={cx("lg-in p-2 min-h-[108px]", d.isToday && "lg-hot")}>
            <p className="px-1 pb-1.5 text-[12px] font-semibold text-[#161827]">{dayName(d.date)} <span className="font-normal text-[#6A6F85]">{local(d.date).getDate()}</span></p>
            <div className="space-y-1">
              {d.classes.length === 0 && <p className="px-1 text-[12px] text-[#6A6F85]">Free</p>}
              {d.classes.map((c) => (
                <div key={c.id} className={cx("flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium bg-white border border-[#161827]/5", c.status === "cancelled" && "opacity-55 line-through")}>
                  <span aria-hidden="true" className="w-1.5 h-4 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="truncate text-[#161827]">{c.code}</span>
                  <span className="ml-auto"><Mark st={c.status} /></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* 5 / 6 (part b): Coming up (holidays, exams, quizzes). */
export function EventsCard({ events, today, demo }) {
  const upcoming = events.filter((e) => e.endDate >= today && e.confirmed !== false).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5);
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.calendar} className="text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Calendar</Link>}>Coming up</Title>
      {upcoming.length ? (
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-3 lg-in px-2.5 py-2">
              <span aria-hidden="true" className="w-11 shrink-0 rounded-xl py-1.5 text-center leading-none bg-white border border-[#161827]/10 text-[#161827]">
                <span className="block text-[15px] font-semibold">{local(e.startDate).getDate()}</span>
                <span className="block text-[10.5px] mt-1 text-[#6A6F85]">{local(e.startDate).toLocaleDateString("en-IN", { month: "short" })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-[#161827] truncate">{e.title}</p>
                <p className="text-[12px] text-[#6A6F85]">{e.endDate !== e.startDate ? `${fmtShort(e.startDate)} to ${fmtShort(e.endDate)}` : fmtShort(e.startDate)}</p>
              </div>
              <Badge tone={tone[e.type] || "amber"}>{e.type}</Badge>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-[#6A6F85]">Nothing scheduled. Holidays, exams and quizzes will show up here.</p>}
    </Card>
  );
}

/* 5 / 6 (part c): Official updates from the CR. */
export function OfficialCard({ official, onReadAll, demo }) {
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={official.joined && official.unread > 0 && <button type="button" onClick={onReadAll} className={ghost}><CheckCheck className="w-4 h-4" aria-hidden="true" />Mark all read</button>}>
        Official updates {official.unread > 0 && <span className="ml-1 align-middle"><Badge tone="brand">{official.unread} new</Badge></span>}
      </Title>
      {official.joined ? (
        official.updates.length ? (
          <ul className="space-y-1.5">
            {official.updates.slice(0, 4).map((u) => (
              <li key={u.id || u._id} className="flex flex-wrap items-start gap-2.5 lg-in px-3 py-2">
                <span aria-hidden="true" className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", u.readAt || u.read ? "bg-transparent" : "bg-sky-500")} />
                <p className="text-[13px] leading-snug text-[#161827] min-w-0 flex-1">{typeof u.summary === "string" ? u.summary : u.summary?.text || `A ${u.targetKind || "schedule"} was ${u.change || "updated"}.`}</p>
                {u.status === "pending" && <Badge tone="amber">Needs you</Badge>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13.5px] text-[#6A6F85]">You're in sync with your CR. Changes will appear here.</p>
      ) : official.joinable ? (
        <div className="rounded-2xl border border-[#161827]/10 bg-white/70 p-3.5">
          <p className="text-[14px] font-semibold text-[#161827]">Your CR has published a timetable</p>
          <p className="text-[13px] text-[#6A6F85] mt-1">Join it to get classes, exams and cancellations without retyping anything.</p>
          <Link to={ROUTES.official} className={cx(ghost, "mt-3")}>Preview and join</Link>
        </div>
      ) : <p className="text-[13.5px] text-[#6A6F85]">No official timetable for your class yet. Once your CR publishes one, you can join it here.</p>}
      {!demo && official.joined && <Link to={ROUTES.official} className="inline-flex items-center min-h-11 sm:min-h-0 mt-1 sm:mt-3 text-[13px] font-medium text-[#161827] underline-offset-2 hover:underline">Review all updates</Link>}
    </Card>
  );
}