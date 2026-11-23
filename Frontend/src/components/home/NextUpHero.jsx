import { Bell, CalendarDays, CheckCheck, Clock, MapPin, Target } from "lucide-react";
import { cx } from "../Ui";
import { Glass, LOOKAHEAD, addDays, dayName, fmtShort, local, mins, toIso } from "./Shared";

/* Hero: what's next, a segmented progress bar for today, and three quiet stats.
   The only colour that varies is the subject accent (a thin bar and the progress segment). */
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
  const accent = /^#[0-9a-f]{6}$/i.test(hero?.color || "") ? hero.color : "var(--accent)";
  const good = (att?.pct ?? 0) >= target;

  const stats = [
    { k: "Attendance", v: att?.pct == null ? "–" : `${Math.round(att.pct)}%`, s: `target ${target}%`, Icon: Target,
      tile: good ? "bg-[color:var(--ok-bg)] text-[color:var(--ok-icon)]" : "bg-[color:var(--warn-bg)] text-[color:var(--warn-icon)]", vc: good ? "text-[color:var(--ok-fg)]" : "text-[color:var(--warn-fg)]" },
    { k: "Marked", v: `${done}/${counted.length}`, s: toGo ? `${toGo} to go` : counted.length ? "all done" : "no classes", Icon: CheckCheck,
      tile: "bg-[color:var(--info-bg)] text-[color:var(--info-icon)]", vc: "text-[color:var(--ink)]" },
    { k: "Updates", v: official.unread, s: official.joined ? "unread" : "not joined", Icon: Bell,
      tile: "bg-[color:var(--brand-bg)] text-[color:var(--accent-soft)]", vc: "text-[color:var(--ink)]" },
  ];

  const nextId = next?.id;

  return (
    <Glass className="relative overflow-hidden p-3.5 sm:p-5 lg:p-7 grid min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] gap-3 sm:gap-4 lg:gap-8 items-center" aria-label="Next class" role="region">
      {/* thin solid bar in the subject's colour replaces the old colour wash */}
      <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px]" style={{ background: accent }} />

      <div className="relative min-w-0">
        <p className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-medium", next ? "bg-[color:var(--brand-bg)] text-[color:var(--brand-fg)]" : "bg-[color:var(--inset)] text-[color:var(--ink)]")}>
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
          {next ? when : ahead ? `Next class, ${aheadLabel}` : "You're all done"}
        </p>

        <p className="text-[21px] min-[380px]:text-[23px] sm:text-[32px] lg:text-[40px] font-semibold tracking-[-0.02em] leading-[1.12] text-[color:var(--ink)] mt-2 sm:mt-3 break-words">
          {hero ? hero.name : "No more classes today"}
        </p>

        {hero ? (
          <div className="mt-2.5 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--inset)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ink)] tabular-nums"><Clock className="w-4 h-4 text-[color:var(--muted)]" aria-hidden="true" />{hero.start} to {hero.end}</span>
            {hero.room && <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--inset)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ink)]"><MapPin className="w-4 h-4 text-[color:var(--muted)]" aria-hidden="true" />{hero.room}</span>}
            {!next && ahead && <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--inset)] px-3 py-1.5 text-[13px] font-medium text-[color:var(--ink)]"><CalendarDays className="w-4 h-4 text-[color:var(--muted)]" aria-hidden="true" />{fmtShort(ahead.date)}</span>}
          </div>
        ) : <p className="text-[14px] text-[color:var(--muted)] mt-3">Nothing scheduled in the next two weeks.</p>}

        {counted.length > 0 && (
          <div className="mt-3 sm:mt-4 max-w-md" role="img" aria-label={`${done} of ${counted.length} classes marked today`}>
            <div className="flex gap-1.5">
              {counted.map((c) => (
                <span key={c.id} className={cx("h-1 sm:h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
                  c.status === "pending" ? (c.id === nextId ? "" : "bg-[color:var(--line)]") : c.status === "absent" ? "bg-[color:var(--bad-solid)]" : c.status === "excused" ? "bg-[color:var(--info-solid)]" : "bg-[color:var(--ok-solid)]")}
                  style={c.status === "pending" && c.id === nextId ? { background: accent } : undefined} />
              ))}
            </div>
            <p className="text-[11.5px] sm:text-[12px] text-[color:var(--muted)] mt-1.5 tabular-nums">{done} of {counted.length} marked today{toGo ? `, ${toGo} to go` : ""}</p>
          </div>
        )}
      </div>

      <div className="relative grid grid-cols-3 gap-1.5 sm:gap-3 min-w-0">
        {stats.map(({ k, v, s, Icon, tile, vc }) => (
          <div key={k} className="rounded-xl bg-[color:var(--inset)] px-2 py-2 sm:p-3.5 min-h-[58px] sm:min-h-[128px] flex flex-col items-center justify-center text-center">
            <span className={cx("hidden sm:flex w-8 h-8 rounded-lg items-center justify-center", tile)}><Icon className="w-4 h-4" aria-hidden="true" /></span>
            <p className={cx("text-[17px] min-[380px]:text-[18px] sm:text-[26px] font-semibold leading-none tabular-nums sm:mt-2.5", vc)}>{v}</p>
            <p className="text-[11px] sm:text-[12.5px] font-medium text-[color:var(--body)] mt-1 sm:mt-1.5 leading-tight">{k}</p>
            <p className="text-[10px] sm:text-[11.5px] text-[color:var(--muted)] mt-px sm:mt-0.5 leading-tight">{s}</p>
          </div>
        ))}
      </div>
    </Glass>
  );
}