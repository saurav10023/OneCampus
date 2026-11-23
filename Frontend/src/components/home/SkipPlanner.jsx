import { useState } from "react";
import { CalendarClock, ChevronDown, Minus, Plus } from "lucide-react";
import { cx } from "../Ui";
import { Card } from "./Shared";

/* Uses the classes still to come (holidays and cancellations already excluded by the server)
   to predict where the semester will end. */
const planOf = (a, h, left, goal) => {
  const total = h + left;
  const need = Math.max(0, Math.ceil((goal / 100) * total - a - 1e-9));
  const canReach = need <= left;
  return { total, need, canReach, canSkip: canReach ? left - need : 0, best: total ? ((a + left) / total) * 100 : 0, worst: total ? (a / total) * 100 : 0 };
};

const Tile = ({ label, value, hint }) => (
  <div className="rounded-xl bg-[color:var(--inset)] px-2 py-2.5 text-center">
    <p className="text-[19px] sm:text-[22px] font-semibold leading-none tabular-nums text-[color:var(--ink)]">{value}</p>
    <p className="text-[11.5px] font-medium text-[color:var(--body)] mt-1.5 leading-tight">{label}</p>
    {hint && <p className="text-[10.5px] text-[color:var(--muted)] mt-0.5 leading-tight">{hint}</p>}
  </div>
);

const small = "hm-btn !h-8 !px-3 !text-[12.5px] !rounded-lg disabled:opacity-40 disabled:pointer-events-none";
const step = "shrink-0 w-8 h-8 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--body)] flex items-center justify-center hover:bg-[color:var(--inset)] disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

/* Skip planner: collapsed by default with a one-line summary. Open it, pick a subject, move the slider. */
export default function SkipPlanner({ att, target, remaining, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [showGoal, setShowGoal] = useState(false);
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
  const tint = hit ? "text-[color:var(--ok-fg)]" : "text-[color:var(--warn-fg)]";
  const live = h > 0 && ready;

  let verdict;
  if (!h) verdict = "Mark a few classes and your prediction will appear here.";
  else if (!ready) verdict = remaining?.status === "error" ? "Couldn't load your upcoming classes, so the prediction is hidden." : "Loading your upcoming classes…";
  else if (left === 0) verdict = "No classes left this semester. Your attendance is final.";
  else if (!p.canReach) verdict = `Even if you attend every class left, you'd finish at ${p.best.toFixed(1)}%, under ${goal}%.`;
  else if (hit) verdict = n === 0 ? `Attend everything and you'll finish at ${predicted.toFixed(1)}%. You still have ${p.canSkip} to spare.` : `Skipping ${n} of ${left}, you'd finish at ${predicted.toFixed(1)}%, safely above ${goal}%.`;
  else verdict = `Skipping ${n} would leave you ${gap} class${gap === 1 ? "" : "es"} short of ${goal}%. ${p.canSkip ? `Keep it to ${p.canSkip} or fewer.` : "Attend all of them."}`;

  /* One-line summary shown while collapsed */
  let summary;
  if (!live) summary = !h ? "Mark a few classes to see your prediction" : remaining?.status === "error" ? "Prediction unavailable" : "Loading upcoming classes…";
  else if (left === 0) summary = "No classes left this semester";
  else if (!p.canReach) summary = `Target out of reach, best case ${p.best.toFixed(1)}%`;
  else summary = `You can skip ${p.canSkip} of ${left} and still hit ${goal}%`;

  return (
    <Card className="!p-0 overflow-hidden">
      {/* Header: the whole row toggles the planner */}
      <button type="button" aria-expanded={open} aria-controls="skip-planner-body" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 px-3.5 min-[380px]:px-4 sm:px-5 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]">
        <span aria-hidden="true" className="shrink-0 self-start mt-0.5 w-9 h-9 rounded-xl bg-[color:var(--brand-bg)] text-[color:var(--accent-soft)] flex items-center justify-center"><CalendarClock className="w-[18px] h-[18px]" /></span>
        <span className="min-w-0 flex-1 block">
          <span className="block text-[15px] font-semibold text-[color:var(--ink)] leading-tight">Skip planner</span>
          <span className="block text-[12.5px] text-[color:var(--muted)] mt-0.5">See how many classes you can miss and still hit your target.</span>
          {/* Glance: what the planner says right now */}
          <span className="flex flex-wrap items-center gap-1.5 mt-2">
            {live && left > 0 && p.canReach ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ok-bg)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--ok-fg)] tabular-nums"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[color:var(--ok-solid)]" />Skip up to {p.canSkip}</span>
                <span className="inline-flex items-center rounded-full bg-[color:var(--inset)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--body)] tabular-nums">Attend {p.need} of {left}</span>
                <span className="inline-flex items-center rounded-full bg-[color:var(--inset)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--body)] tabular-nums">Target {goal}%</span>
              </>
            ) : live && left > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--warn-bg)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--warn-fg)] tabular-nums"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[color:var(--warn-solid)]" />{summary}</span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[color:var(--inset)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--body)]">{summary}</span>
            )}
          </span>
        </span>
        <span className="shrink-0 self-start mt-1 hidden sm:inline text-[12.5px] font-medium text-[color:var(--accent-soft)]">{open ? "Hide" : "Plan"}</span>
        <ChevronDown className={cx("w-5 h-5 shrink-0 mt-1 text-[color:var(--muted)] transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>

      <div id="skip-planner-body" className={cx("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className={cx("overflow-hidden", !open && "invisible")}>
          <div className="px-3.5 min-[380px]:px-4 sm:px-5 pb-4 sm:pb-5 pt-1 border-t border-[color:var(--line-soft)]">

            {/* Subject selection */}
            <div className="mt-3.5">
              <div className="flex items-baseline justify-between gap-3 px-0.5 mb-2">
                <p className="text-[12.5px] font-semibold text-[color:var(--ink)]">Subject</p>
                <p className="text-[12px] text-[color:var(--muted)] truncate">{cur.name}</p>
              </div>
              <div className="flex gap-1.5 overflow-x-auto hm-scroll -mx-1 px-1 pb-1" role="group" aria-label="Choose a subject">
                {[{ id: "all", name: "All", color: null }, ...subjects].map((s) => {
                  const on = sel === s.id;
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => pick(s.id)}
                      className={cx("h-9 shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-full text-[13px] font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1",
                        on ? "bg-[color:var(--accent)] border-[color:var(--accent)] text-white" : "bg-[color:var(--surface)] border-[color:var(--line)] text-[color:var(--body)] hover:bg-[color:var(--inset)]")}>
                      {s.color && <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: on ? "#fff" : s.color }} />}{s.code || s.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 grid md:grid-cols-2 gap-3 md:gap-4 items-stretch">
              {/* prediction */}
              <div aria-live="polite" className={cx("rounded-2xl border p-3.5 sm:p-4", !live ? "bg-[color:var(--inset)] border-[color:var(--line)]" : hit ? "bg-[color:var(--ok-bg)] border-[color:var(--ok-line)]" : "bg-[color:var(--warn-bg)] border-[color:var(--warn-line)]")}>
                <p className="text-[12px] text-[color:var(--muted)]">{cur.name}: {nowPct.toFixed(1)}% now ({a}/{h})</p>
                <div className="flex items-end gap-2 mt-1">
                  <p className={cx("text-[38px] sm:text-[46px] font-semibold leading-none tabular-nums", live ? tint : "text-[color:var(--dim2)]")}>{live ? predicted.toFixed(1) : "–"}<span className="text-[20px]">%</span></p>
                  <p className="text-[12px] text-[color:var(--muted)] pb-1 leading-tight">predicted<br />at semester end</p>
                </div>

                {/* range: worst case to best case, with target and your plan */}
                {live && left > 0 && (
                  <div className="mt-4" role="img" aria-label={`Final attendance can range from ${p.worst.toFixed(0)} to ${p.best.toFixed(0)} percent. Target ${goal}. Your plan ${predicted.toFixed(1)}.`}>
                    <div className="relative h-2 rounded-full bg-[color:var(--line)]">
                      <span className="absolute inset-y-0 rounded-full bg-[color:var(--brand-band)]" style={{ left: pos(p.worst), width: `calc(${pos(p.best)} - ${pos(p.worst)})` }} />
                      <span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[color:var(--tick-strong)]" style={{ left: pos(goal) }} />
                      <span aria-hidden="true" className={cx("absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-[color:var(--surface)] shadow-sm transition-[left] duration-300 motion-reduce:transition-none", hit ? "border-[color:var(--ok-solid)]" : "border-[color:var(--warn-solid)]")} style={{ left: pos(predicted) }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-[color:var(--muted)] mt-2 tabular-nums">
                      <span>Skip all {p.worst.toFixed(0)}%</span><span>Target {goal}%</span><span>Attend all {p.best.toFixed(0)}%</span>
                    </div>
                  </div>
                )}
                <p className={cx("text-[13px] leading-snug mt-3", live ? (hit ? "text-[color:var(--ok-ink)]" : "text-[color:var(--warn-ink)]") : "text-[color:var(--muted)]")}>{verdict}</p>
              </div>

              {/* controls */}
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <Tile label="Left" value={ready ? left : "–"} hint="holidays excluded" />
                  <Tile label="Can skip" value={ready && h ? (p.canReach ? p.canSkip : "–") : "–"} hint={ready && h && !p.canReach ? "out of reach" : "and hit goal"} />
                  <Tile label="Must attend" value={ready && h ? (p.canReach ? p.need : "–") : "–"} hint="to hit goal" />
                </div>

                <div className="rounded-xl bg-[color:var(--inset)] px-3.5 py-2.5">
                  <label htmlFor="skip-n" className="flex items-center justify-between text-[13px] font-medium text-[color:var(--body)]">
                    If I skip <span className="text-[color:var(--ink)] text-[15px] tabular-nums">{n} of {left}</span>
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <button type="button" aria-label="Skip one fewer" className={step} disabled={!ready || n <= 0} onClick={() => setSkip(Math.max(0, n - 1))}><Minus className="w-4 h-4" aria-hidden="true" /></button>
                    <input id="skip-n" type="range" className="hm-range flex-1 min-w-0" min="0" max={Math.max(left, 0)} step="1" value={n} disabled={!ready || left === 0}
                      onChange={(e) => setSkip(Number(e.target.value))} />
                    <button type="button" aria-label="Skip one more" className={step} disabled={!ready || n >= left} onClick={() => setSkip(Math.min(left, n + 1))}><Plus className="w-4 h-4" aria-hidden="true" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1.5">
                    <button type="button" disabled={!ready || !left} onClick={() => setSkip(0)} className={small}>Attend all</button>
                    <button type="button" disabled={!ready || !p.canReach || !p.canSkip} onClick={() => setSkip(p.canSkip)} className={small}>Safe max ({p.canReach ? p.canSkip : 0})</button>
                  </div>
                </div>

                {/* Target: tucked away until needed */}
                <div className="rounded-xl bg-[color:var(--inset)] px-3.5 py-2.5">
                  <button type="button" aria-expanded={showGoal} aria-controls="skip-goal-wrap" onClick={() => setShowGoal((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 text-[13px] font-medium text-[color:var(--body)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] rounded">
                    <span>Target</span>
                    <span className="flex items-center gap-1.5 text-[color:var(--ink)] text-[15px] tabular-nums">{goal}%
                      <ChevronDown className={cx("w-4 h-4 text-[color:var(--muted)] transition-transform duration-200 motion-reduce:transition-none", showGoal && "rotate-180")} aria-hidden="true" />
                    </span>
                  </button>
                  <div id="skip-goal-wrap" className={cx("grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none", showGoal ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className={cx("overflow-hidden", !showGoal && "invisible")}>
                      <label htmlFor="skip-goal" className="sr-only">Target attendance</label>
                      <input id="skip-goal" type="range" className="hm-range mt-1" min="50" max="95" step="5" value={goal} onChange={(e) => setCustom(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11.5px] text-[color:var(--muted)] mt-3 px-0.5">A prediction, not a promise. A new holiday or cancellation will change it.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}