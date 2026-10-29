import { CalendarDays, Clock, MapPin } from "lucide-react";
import { cx } from "../Ui";
import { Glass, LOOKAHEAD, addDays, dayName, fmtShort, local, mins, toIso } from "./Shared";

/* 1 / 6: Hero. What's next, today's progress and three quick stats. */
export default function NextUpHero({ vm }) {
  const { today, att, official, target, days } = vm;
  const list = today?.classes || [];
  const next = today?.nextClass || list.find((c) => c.status === "pending");
  const counted = list.filter((c) => c.status !== "cancelled" && c.status !== "not_counted");
  const done = counted.filter((c) => c.status !== "pending").length;
  const toGo = counted.length - done;
  const left = next && today?.now ? mins(next.start) - mins(today.now) : null;
  const when = left == null || left <= 0 ? "Up next today" : `Starts in ${left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left} min`}`;

  // Nothing left today: look ahead for the first class on a later (loaded) day.
  let ahead = null;
  if (!next && today?.date && days?.length) {
    const base = local(today.date);
    for (let o = 1; o <= LOOKAHEAD && !ahead; o++) {
      const d = days.find((x) => x.date === toIso(addDays(base, o)));
      const c = d?.classes?.find((x) => x.status !== "cancelled" && x.status !== "not_counted");
      if (c) ahead = { c, o, date: d.date };
    }
  }
  const aheadLabel = ahead ? (ahead.o === 1 ? "Tomorrow" : dayName(ahead.date, "long")) : "";
  const hero = next || ahead?.c;
  const accent = hero?.color || "#94A3B8";

  const stats = [
    { k: "Attendance", v: att?.pct == null ? "–" : `${Math.round(att.pct)}%`, s: `target ${target}%`, good: (att?.pct ?? 0) >= target },
    { k: "Marked", v: `${done}/${counted.length}`, s: toGo ? `${toGo} to go` : counted.length ? "all done" : "no classes" },
    { k: "Updates", v: official.unread, s: official.joined ? "unread" : "not joined" },
  ];

  return (
    <Glass className="relative lq-glow overflow-hidden p-3.5 min-[380px]:p-4 sm:p-6 grid min-w-0 md:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] gap-4 sm:gap-5 md:gap-8 items-center" aria-label="Next class" role="region">
      <div className="relative min-w-0">
        <p className="inline-flex items-center gap-2 rounded-full lq-btn px-3 py-1.5 text-[12px] font-semibold text-[#161827]">
          <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: accent, boxShadow: `0 0 0 4px ${accent}26` }} />
          {next ? when : ahead ? `Next class, ${aheadLabel}` : "You're done"}
        </p>
        <p className="text-[22px] sm:text-[32px] font-semibold tracking-tight leading-[1.1] text-[#161827] mt-2.5 truncate">
          {hero ? hero.name : "No more classes today"}
        </p>
        {hero ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827] tabular-nums"><Clock className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{hero.start} to {hero.end}</span>
            {hero.room && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827]"><MapPin className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{hero.room}</span>}
            {!next && ahead && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[12.5px] font-medium text-[#161827]"><CalendarDays className="w-3.5 h-3.5 text-[#6A6F85]" aria-hidden="true" />{fmtShort(ahead.date)}</span>}
          </div>
        ) : <p className="text-[13.5px] text-[#6A6F85] mt-2">Nothing scheduled in the next two weeks.</p>}
        {counted.length > 0 && (
          <div className="mt-3.5 max-w-sm" role="img" aria-label={`${done} of ${counted.length} classes marked today`}>
            <div className="h-1.5 rounded-full bg-[#161827]/[.07] overflow-hidden">
              <span className="block h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(done / counted.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-2 min-w-0">
        {stats.map((x) => (
          <div key={x.k} className="lq-in p-2 min-h-[72px] sm:min-h-[88px] flex flex-col items-center justify-center text-center">
            <p className={cx("text-[19px] min-[380px]:text-[21px] sm:text-[26px] font-semibold leading-none tabular-nums", x.good === false ? "text-amber-700" : x.good ? "text-emerald-700" : "text-[#161827]")}>{x.v}</p>
            <p className="text-[11.5px] sm:text-[12px] font-medium text-[#444A63] mt-1.5 leading-tight">{x.k}</p>
            <p className="text-[10.5px] sm:text-[11.5px] text-[#6A6F85] mt-0.5 leading-tight">{x.s}</p>
          </div>
        ))}
      </div>
    </Glass>
  );
}