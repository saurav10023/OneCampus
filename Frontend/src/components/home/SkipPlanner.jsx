import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Badge, cx } from "../Ui";
import { Card, Title, ghost } from "./Shared";

/* Uses the classes still to come (holidays and cancellations already excluded by the server)
   to predict where the semester will end. */
const planOf = (a, h, left, goal) => {
  const total = h + left;
  const need = Math.max(0, Math.ceil((goal / 100) * total - a - 1e-9));
  const canReach = need <= left;
  return { total, need, canReach, canSkip: canReach ? left - need : 0, best: total ? ((a + left) / total) * 100 : 0, worst: total ? (a / total) * 100 : 0 };
};

const Tile = ({ label, value, hint }) => (
  <div className="lg-in px-2 py-2.5 text-center">
    <p className="text-[20px] sm:text-[22px] font-semibold leading-none tabular-nums text-[#161827]">{value}</p>
    <p className="text-[11.5px] text-[#444A63] mt-1.5 leading-tight">{label}</p>
    {hint && <p className="text-[11px] text-[#6A6F85] mt-0.5 leading-tight">{hint}</p>}
  </div>
);

/* 4 / 6: Skip planner. Move the slider to try different plans. */
export default function SkipPlanner({ att, target, remaining }) {
  const [sel, setSel] = useState("all");
  const [custom, setCustom] = useState(null);
  const [skip, setSkip] = useState(0);

  const ready = remaining?.status === "ready";
  const subjects = att?.subjects || [];
  const cur = sel === "all" ? { name: "All subjects", att: att?.att ?? 0, held: att?.held ?? 0, target }
    : subjects.find((s) => s.id === sel) || { name: "Subject", att: 0, held: 0, target };
  const left = !ready ? 0 : sel === "all"
    ? subjects.reduce((n, s) => n + (remaining.bySubject[String(s.id)] || 0), 0)
    : remaining.bySubject[String(sel)] || 0;

  const goal = custom ?? cur.target ?? target;
  const { att: a, held: h } = cur;
  const p = planOf(a, h, left, goal);
  const n = Math.min(skip, left);
  const predicted = p.total ? ((a + left - n) / p.total) * 100 : 0;
  const nowPct = h ? (a / h) * 100 : 0;
  const hit = predicted >= goal - 1e-9;
  const gap = Math.max(0, Math.ceil((goal / 100) * p.total - (a + left - n) - 1e-9));

  const pick = (id) => { setSel(id); setCustom(null); setSkip(0); };
  const pos = (v) => `${Math.max(0, Math.min(100, v))}%`;
  const tint = hit ? "text-emerald-700" : "text-amber-700";

  let verdict;
  if (!h) verdict = "Mark a few classes and your prediction will appear here.";
  else if (!ready) verdict = remaining?.status === "error" ? "Couldn't load your upcoming classes, so the prediction is hidden." : "Loading your upcoming classes…";
  else if (left === 0) verdict = "No classes left this semester. Your attendance is final.";
  else if (!p.canReach) verdict = `Even if you attend every class left, you'd finish at ${p.best.toFixed(1)}%, under ${goal}%.`;
  else if (hit) verdict = n === 0 ? `Attend everything and you'll finish at ${predicted.toFixed(1)}%. You still have ${p.canSkip} to spare.` : `Skipping ${n} of ${left}, you'd finish at ${predicted.toFixed(1)}%, safely above ${goal}%.`;
  else verdict = `Skipping ${n} would leave you ${gap} class${gap === 1 ? "" : "es"} short of ${goal}%. ${p.canSkip ? `Keep it to ${p.canSkip} or fewer.` : "Attend all of them."}`;

  return (
    <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
      <Title right={ready && left > 0 && <Badge tone="brand"><CalendarClock className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />{left} ahead</Badge>}>Skip planner</Title>

      <div className="flex gap-1.5 overflow-x-auto hm-scroll -mx-1 px-1 pb-1" role="group" aria-label="Choose a subject">
        {[{ id: "all", name: "All", color: null }, ...subjects].map((s) => (
          <button key={s.id} type="button" aria-pressed={sel === s.id} onClick={() => pick(s.id)}
            className={cx("h-10 sm:h-9 shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-full text-[13px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50",
              sel === s.id ? "lg-pill lg-on text-white" : "lg-pill text-[#161827]/75")}>
            {s.color && <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: sel === s.id ? "#fff" : s.color }} />}{s.code || s.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid md:grid-cols-2 gap-3 md:gap-4 items-stretch">
        {/* prediction */}
        <div aria-live="polite" className={cx("rounded-2xl border p-3.5 sm:p-4", !h || !ready ? "lg-in" : hit ? "bg-emerald-500/[.07] border-emerald-200" : "bg-amber-500/[.09] border-amber-200")}>
          <p className="text-[12px] text-[#6A6F85]">{cur.name}: {nowPct.toFixed(1)}% now ({a}/{h})</p>
          <div className="flex items-end gap-2 mt-1">
            <p className={cx("text-[40px] sm:text-[48px] font-semibold leading-none tabular-nums", h && ready ? tint : "text-[#161827]/40")}>{h && ready ? predicted.toFixed(1) : "–"}<span className="text-[22px]">%</span></p>
            <p className="text-[12px] text-[#6A6F85] pb-1 leading-tight">predicted<br />at semester end</p>
          </div>

          {/* range: worst case to best case, with target and your plan */}
          {h > 0 && ready && left > 0 && (
            <div className="mt-4" role="img" aria-label={`Final attendance can range from ${p.worst.toFixed(0)} to ${p.best.toFixed(0)} percent. Target ${goal}. Your plan ${predicted.toFixed(1)}.`}>
              <div className="relative h-2.5 rounded-full bg-[#161827]/8">
                <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-amber-300 via-sky-300 to-emerald-300" style={{ left: pos(p.worst), width: `calc(${pos(p.best)} - ${pos(p.worst)})` }} />
                <span aria-hidden="true" className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-[#161827]/55" style={{ left: pos(goal) }} />
                <span aria-hidden="true" className={cx("absolute top-1/2 w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-white shadow transition-[left] duration-300 motion-reduce:transition-none", hit ? "border-emerald-500" : "border-amber-500")} style={{ left: pos(predicted) }} />
              </div>
              <div className="flex justify-between text-[11px] text-[#6A6F85] mt-2 tabular-nums">
                <span>Skip all {p.worst.toFixed(0)}%</span><span>Target {goal}%</span><span>Attend all {p.best.toFixed(0)}%</span>
              </div>
            </div>
          )}
          <p className={cx("text-[13px] leading-snug mt-3", h && ready ? (hit ? "text-emerald-900" : "text-amber-900") : "text-[#6A6F85]")}>{verdict}</p>
        </div>

        {/* controls */}
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Left" value={ready ? left : "–"} hint="holidays excluded" />
            <Tile label="Can skip" value={ready && h ? (p.canReach ? p.canSkip : "–") : "–"} hint={ready && h && !p.canReach ? "out of reach" : "and hit goal"} />
            <Tile label="Must attend" value={ready && h ? (p.canReach ? p.need : "–") : "–"} hint="to hit goal" />
          </div>

          <div className="lg-in px-3.5 py-2">
            <label htmlFor="skip-n" className="flex items-center justify-between text-[13px] font-medium text-[#444A63]">
              If I skip <span className="text-[#161827] text-[15px] tabular-nums">{n} of {left}</span>
            </label>
            <input id="skip-n" type="range" className="hm-range" min="0" max={Math.max(left, 0)} step="1" value={n} disabled={!ready || left === 0}
              onChange={(e) => setSkip(Number(e.target.value))} />
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button type="button" disabled={!ready || !left} onClick={() => setSkip(0)} className={cx(ghost, "disabled:opacity-40")}>Attend all</button>
              <button type="button" disabled={!ready || !p.canReach || !p.canSkip} onClick={() => setSkip(p.canSkip)} className={cx(ghost, "disabled:opacity-40")}>Safe max ({p.canReach ? p.canSkip : 0})</button>
            </div>
          </div>

          <div className="lg-in px-3.5 py-2">
            <label htmlFor="skip-goal" className="flex items-center justify-between text-[13px] font-medium text-[#444A63]">Target <span className="text-[#161827] text-[15px] tabular-nums">{goal}%</span></label>
            <input id="skip-goal" type="range" className="hm-range" min="50" max="95" step="5" value={goal} onChange={(e) => setCustom(Number(e.target.value))} />
          </div>
        </div>
      </div>
      <p className="text-[11.5px] text-[#6A6F85] mt-2.5 px-1">A prediction, not a promise. A new holiday or cancellation will change it.</p>
    </Card>
  );
}