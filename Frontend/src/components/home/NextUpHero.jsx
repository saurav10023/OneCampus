import { Bell, CalendarDays, CheckCheck, Clock, MapPin, Sparkles, Target } from "lucide-react";
import { cx } from "../Ui";
import { Glass, LOOKAHEAD, addDays, dayName, fmtShort, local, mins, toIso } from "./Shared";

/* Hero: what's next, a segmented progress bar for today, and three colour-coded stats. */
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
  const accent = /^#[0-9a-f]{6}$/i.test(hero?.color || "") ? hero.color : "#5B52EE";
  const good = (att?.pct ?? 0) >= target;

  const stats = [
    { k: "Attendance", v: att?.pct == null ? "–" : `${Math.round(att.pct)}%`, s: `target ${target}%`, Icon: Target,
      tint: good ? "from-emerald-400 to-teal-500" : "from-amber-400 to-orange-500", vc: good ? "text-emerald-700" : "text-amber-700" },
    { k: "Marked", v: `${done}/${counted.length}`, s: toGo ? `${toGo} to go` : counted.length ? "all done" : "no classes", Icon: CheckCheck,
      tint: "from-sky-400 to-blue-500", vc: "text-[#161827]" },
    { k: "Updates", v: official.unread, s: official.joined ? "unread" : "not joined", Icon: Bell,
      tint: "from-violet-500 to-indigo-500", vc: "text-[#161827]" },
  ];

  const nextId = next?.id;

  return (
    <Glass className="relative lq-glow overflow-hidden p-4 sm:p-6 lg:p-8 grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] gap-5 lg:gap-10 items-center" aria-label="Next class" role="region">
      {/* colour wash that follows the subject */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(60% 120% at 0% 0%, ${accent}33, transparent 70%), radial-gradient(50% 100% at 100% 100%, rgba(43,141,224,.22), transparent 70%)` }} />
      <div aria-hidden="true" className="hm-orb -top-16 right-[30%] h-48 w-48" style={{ background: accent, opacity: 0.28 }} />

      <div className="relative min-w-0">
        <p className={cx("inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold", next ? "hm-grad" : "lq-btn text-[#161827]")}>
          {next ? <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> : <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: accent }} />}
          {next ? when : ahead ? `Next class, ${aheadLabel}` : "You're all done"}
        </p>

        <p className="text-[28px] min-[380px]:text-[32px] sm:text-[44px] lg:text-[52px] font-semibold tracking-[-0.025em] leading-[1.05] text-[#161827] mt-3.5 break-words">
          {hero ? hero.name : "No more classes today"}
        </p>

        {hero ? (
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#161827] tabular-nums"><Clock className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />{hero.start} to {hero.end}</span>
            {hero.room && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#161827]"><MapPin className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />{hero.room}</span>}
            {!next && ahead && <span className="lq-in !rounded-full inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#161827]"><CalendarDays className="w-4 h-4 text-[#4F46E5]" aria-hidden="true" />{fmtShort(ahead.date)}</span>}
          </div>
        ) : <p className="text-[14px] text-[#6A6F85] mt-3">Nothing scheduled in the next two weeks.</p>}

        {counted.length > 0 && (
          <div className="mt-5 max-w-md" role="img" aria-label={`${done} of ${counted.length} classes marked today`}>
            <div className="flex gap-1.5">
              {counted.map((c) => (
                <span key={c.id} className={cx("h-2 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none",
                  c.status === "pending" ? (c.id === nextId ? "animate-pulse" : "bg-[#161827]/10") : c.status === "absent" ? "bg-gradient-to-r from-rose-300 to-rose-500" : c.status === "excused" ? "bg-gradient-to-r from-sky-300 to-sky-500" : "bg-gradient-to-r from-emerald-300 to-emerald-500")}
                  style={c.status === "pending" && c.id === nextId ? { background: `linear-gradient(90deg, ${accent}99, ${accent})` } : undefined} />
              ))}
            </div>
            <p className="text-[12px] text-[#6A6F85] mt-2 tabular-nums">{done} of {counted.length} marked today{toGo ? `, ${toGo} to go` : ""}</p>
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-2 sm:gap-3 min-w-0">
        {stats.map(({ k, v, s, Icon, tint, vc }) => (
          <div key={k} className="lq-in p-2.5 sm:p-3.5 min-h-[104px] sm:min-h-[132px] flex flex-col items-center justify-center text-center">
            <span className={cx("w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br text-white flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_8px_14px_-8px_rgba(22,24,39,.45)]", tint)}><Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" aria-hidden="true" /></span>
            <p className={cx("text-[20px] min-[380px]:text-[22px] sm:text-[28px] font-semibold leading-none tabular-nums mt-2.5", vc)}>{v}</p>
            <p className="text-[11.5px] sm:text-[12.5px] font-medium text-[#444A63] mt-1.5 leading-tight">{k}</p>
            <p className="text-[10.5px] sm:text-[11.5px] text-[#6A6F85] mt-0.5 leading-tight">{s}</p>
          </div>
        ))}
      </div>
    </Glass>
  );
}