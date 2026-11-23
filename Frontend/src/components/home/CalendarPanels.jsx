import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCheck, X } from "lucide-react";
import { Badge, cx } from "../Ui";
import { Card, ROUTES, Title, dayName, fmtLong, fmtShort, ghost, local, tone } from "./Shared";

const SEL = "bg-[color:var(--accent)] border-[color:var(--accent)] text-white";
const TEXT_LINK = "text-[13px] font-medium text-[color:var(--accent-soft)] hover:text-[color:var(--brand-fg)] underline-offset-2 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

const Mark = ({ st }) => st === "present" ? <Check className="w-3.5 h-3.5 text-[color:var(--ok-icon)] shrink-0" aria-label="Present" /> : st === "absent" ? <X className="w-3.5 h-3.5 text-[color:var(--bad-icon)] shrink-0" aria-label="Absent" /> : null;

/* This week. Day tabs on phones, 7-column grid on desktop. */
export function WeekCard({ week, demo }) {
  const [sel, setSel] = useState(() => (week.find((d) => d.isToday) || week[0]).date);
  const day = week.find((d) => d.date === sel) || week[0];
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.attendance} className={TEXT_LINK}>Timetable</Link>}>This week</Title>

      <div className="lg:hidden">
        <div role="tablist" aria-label="Pick a day" className="grid grid-cols-7 gap-1">
          {week.map((d) => (
            <button key={d.date} type="button" role="tab" aria-selected={d.date === sel} onClick={() => setSel(d.date)}
              className={cx("flex flex-col items-center gap-0.5 rounded-xl border py-1.5 min-h-[54px] text-[11.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                d.date === sel ? SEL : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--ink)] hover:bg-[color:var(--inset)]", d.isToday && d.date !== sel && "!border-[color:var(--brand-ring)]")}>
              <span className={d.date === sel ? "opacity-80" : "text-[color:var(--muted)]"}>{dayName(d.date)}</span>
              <span className="text-[15px] font-semibold leading-tight tabular-nums">{local(d.date).getDate()}</span>
              <span className="flex gap-0.5 h-1.5 items-center">{d.classes.slice(0, 4).map((c) => <i key={c.id} className="w-1.5 h-1.5 rounded-full" style={{ background: d.date === sel ? "#fff" : c.color }} />)}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] font-medium text-[color:var(--ink)] mt-3 mb-2">{fmtLong(day.date)}{day.isToday ? " (today)" : ""}</p>
        {day.classes.length ? (
          <ul className="space-y-1.5">
            {day.classes.map((c) => (
              <li key={c.id} className="relative flex items-center gap-3 rounded-xl bg-[color:var(--inset)] pl-5 pr-3 py-2.5 overflow-hidden">
                <span aria-hidden="true" className="absolute left-2 inset-y-2.5 w-1 rounded-full" style={{ background: c.color }} />
                <span className="w-11 text-[13px] font-semibold tabular-nums text-[color:var(--ink)]">{c.start}</span>
                <span className={cx("min-w-0 flex-1 truncate text-[13.5px] font-medium text-[color:var(--ink)]", c.status === "cancelled" && "line-through opacity-60")}>{c.name || c.code}</span>
                {c.status === "cancelled" ? <Badge tone="red">Cancelled</Badge> : <Mark st={c.status} />}
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl bg-[color:var(--inset)] px-4 py-5 text-center text-[13.5px] text-[color:var(--muted)]">No classes this day.</p>}
      </div>

      <div className="hidden lg:grid grid-cols-7 gap-2">
        {week.map((d) => (
          <div key={d.date} className={cx("rounded-xl border p-2 min-h-[108px]", d.isToday ? "bg-[color:var(--brand-bg)] border-[color:var(--brand-line)]" : "bg-[color:var(--inset)] border-transparent")}>
            <p className="px-1 pb-1.5 text-[12px] font-semibold text-[color:var(--ink)]">{dayName(d.date)} <span className="font-normal text-[color:var(--muted)] tabular-nums">{local(d.date).getDate()}</span></p>
            <div className="space-y-1">
              {d.classes.length === 0 && <p className="px-1 text-[12px] text-[color:var(--muted)]">Free</p>}
              {d.classes.map((c) => (
                <div key={c.id} className={cx("flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium bg-[color:var(--surface)] border border-[color:var(--line)]", c.status === "cancelled" && "opacity-55 line-through")}>
                  <span aria-hidden="true" className="w-1 h-4 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="truncate text-[color:var(--ink)]">{c.code}</span>
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

/* Coming up (holidays, exams, quizzes). */
export function EventsCard({ events, today, demo }) {
  const upcoming = events.filter((e) => e.endDate >= today && e.confirmed !== false).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 5);
  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={!demo && <Link to={ROUTES.calendar} className={TEXT_LINK}>Calendar</Link>}>Coming up</Title>
      {upcoming.length ? (
        <ul className="space-y-1.5">
          {upcoming.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl bg-[color:var(--inset)] px-2.5 py-2">
              <span aria-hidden="true" className="w-11 shrink-0 rounded-lg py-1.5 text-center leading-none bg-[color:var(--surface)] border border-[color:var(--line)] text-[color:var(--ink)]">
                <span className="block text-[15px] font-semibold tabular-nums">{local(e.startDate).getDate()}</span>
                <span className="block text-[10.5px] mt-1 text-[color:var(--muted)]">{local(e.startDate).toLocaleDateString("en-IN", { month: "short" })}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{e.title}</p>
                <p className="text-[12px] text-[color:var(--muted)]">{e.endDate !== e.startDate ? `${fmtShort(e.startDate)} to ${fmtShort(e.endDate)}` : fmtShort(e.startDate)}</p>
              </div>
              <Badge tone={tone[e.type] || "amber"}>{e.type}</Badge>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13.5px] text-[color:var(--muted)]">Nothing scheduled. Holidays, exams and quizzes will show up here.</p>}
    </Card>
  );
}

/* Official updates from the CR. */
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
              <li key={u.id || u._id} className="flex flex-wrap items-start gap-2.5 rounded-xl bg-[color:var(--inset)] px-3 py-2.5">
                <span aria-hidden="true" className={cx("mt-1.5 w-2 h-2 rounded-full shrink-0", u.readAt || u.read ? "bg-transparent" : "bg-[color:var(--accent)]")} />
                <p className="text-[13px] leading-snug text-[color:var(--ink)] min-w-0 flex-1">{typeof u.summary === "string" ? u.summary : u.summary?.text || `A ${u.targetKind || "schedule"} was ${u.change || "updated"}.`}</p>
                {u.status === "pending" && <Badge tone="amber">Needs you</Badge>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13.5px] text-[color:var(--muted)]">You're in sync with your CR. Changes will appear here.</p>
      ) : official.joinable ? (
        <div className="rounded-xl border border-[color:var(--brand-line)] bg-[color:var(--brand-bg)] p-3.5">
          <p className="text-[14px] font-semibold text-[color:var(--ink)]">Your CR has published a timetable</p>
          <p className="text-[13px] text-[color:var(--muted)] mt-1">Join it to get classes, exams and cancellations without retyping anything.</p>
          <Link to={ROUTES.official} className={cx(ghost, "mt-3")}>Preview and join</Link>
        </div>
      ) : <p className="text-[13.5px] text-[color:var(--muted)]">No official timetable for your class yet. Once your CR publishes one, you can join it here.</p>}
      {!demo && official.joined && <Link to={ROUTES.official} className={cx(TEXT_LINK, "inline-flex items-center min-h-11 sm:min-h-0 mt-1 sm:mt-3")}>Review all updates</Link>}
    </Card>
  );
}