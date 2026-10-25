import { useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Info, Minus, Plus, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { Badge, Card, ProgressBar, cx } from "./Ui";
import {
  STATUS_META,
  afterAttend,
  afterSkip,
  needToAttend,
  pctOf,
  plural,
  round1,
  semesterPlan,
  skipBudget,
  statusOf,
  toneBox,
  toneDot,
  toneText,
} from "../lib/attendance";

const MAX = 10;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";
const GRADIENT = "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] shadow-md shadow-indigo-500/25";

const fmtPct = (n) => (n == null ? "-" : `${round1(n)}%`);
const clamp = (v) => Math.max(0, Math.min(100, v));

const Stat = ({ label, value, hint, tone = "ink", loading }) => (
  <div className="rounded-2xl bg-white/60 border border-white/80 px-4 py-3">
    <p className="text-[12.5px] text-[#6A6F85]">{label}</p>
    <div className={cx("text-[26px] font-semibold leading-tight mt-0.5", toneText[tone])}>
      {loading ? <span className="inline-block h-6 w-12 rounded-lg bg-[#161827]/10 animate-pulse align-middle motion-reduce:animate-none" /> : value}
    </div>
    {hint && <p className="text-[12px] text-[#6A6F85] mt-0.5">{hint}</p>}
  </div>
);

// Where you are now, where the target sits, and the range you can still finish in.
const Outlook = ({ plan, now, t }) => {
  const low = Math.min(plan.worst, t, now ?? 100);
  const lo = Math.max(0, Math.floor((low - 8) / 10) * 10);
  const pos = (v) => clamp(((v - lo) / (100 - lo)) * 100);
  const from = pos(plan.worst);
  const to = pos(plan.best);

  return (
    <div>
      <div
        role="img"
        aria-label={`You can finish anywhere from ${fmtPct(plan.worst)} to ${fmtPct(plan.best)}. Your target is ${t}%.`}
        className="relative h-3 rounded-full bg-[#161827]/[0.07] mt-3"
      >
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0] opacity-80"
          style={{ left: `${from}%`, width: `${Math.max(1.5, to - from)}%` }}
        />
        <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded bg-[#161827]/70" style={{ left: `${pos(t)}%` }} />
        {now != null && (
          <div
            className="absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-[3px] border-[#161827] shadow"
            style={{ left: `${pos(now)}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[11.5px] text-[#6A6F85] mt-1.5">
        <span>{lo}%</span>
        <span>100%</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-[#6A6F85]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-white border-[3px] border-[#161827]" />You now
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-0.5 h-3 rounded bg-[#161827]/70" />Target
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-2 rounded-full bg-gradient-to-r from-[#5B52EE] to-[#2B8DE0]" />Where you can finish
        </span>
      </div>
    </div>
  );
};

// The headline answer to "can I skip?"
const buildVerdict = ({ hasData, now, t, known, left, plan, budget, need, a, h }) => {
  if (!hasData) {
    return {
      tone: "neutral",
      icon: Info,
      title: "Nothing to predict yet",
      text: "Once some classes are marked (or you match your college record), this will tell you how many you can safely skip.",
    };
  }

  if (known && left === 0) {
    const met = now >= t;
    return {
      tone: met ? "green" : "red",
      icon: met ? CheckCircle2 : XCircle,
      title: met ? "No classes left, and you met your target" : "No classes left, and you finished below target",
      text: `You finish at ${fmtPct(now)} against a ${t}% target.`,
    };
  }

  if (plan) {
    if (!plan.canReach) {
      return {
        tone: "red",
        icon: XCircle,
        title: "The target can't be reached this semester",
        text: `Even if you attend all ${plural(left, "remaining class")}, you finish at ${fmtPct(plan.best)}, below ${t}%. Lower the target in your setup settings if that is expected.`,
      };
    }
    if (now >= t) {
      if (plan.canSkip > 0) {
        return {
          tone: "green",
          icon: CheckCircle2,
          title: `You can skip ${plural(plan.canSkip, "class")} of the ${left} left`,
          text: `Attend at least ${plan.mustAttend} of them and you finish at ${t}% or above.`,
        };
      }
      return {
        tone: "amber",
        icon: AlertTriangle,
        title: "No room to skip",
        text: `You are at ${fmtPct(now)}, but you need all ${plural(left, "remaining class")} to finish at ${t}%.`,
      };
    }
    return {
      tone: "red",
      icon: AlertTriangle,
      title: `Attend at least ${plan.mustAttend} of the ${plural(left, "class")} left`,
      text: `You are ${round1(t - now)} points below your ${t}% target. ${
        plan.canSkip > 0 ? `You can still skip ${plural(plan.canSkip, "class")} along the way.` : "Every remaining class counts."
      }`,
    };
  }

  // Fallback when the number of remaining classes is not known.
  if (now >= t) {
    if (budget === Infinity) return { tone: "green", icon: CheckCircle2, title: "No limit", text: "Your target is 0%, so skipping never puts you below it." };
    if (budget > 0) {
      return {
        tone: "green",
        icon: CheckCircle2,
        title: `You can skip up to ${plural(budget, "class")}`,
        text: `You would still be at or above ${t}%. Skipping ${budget + 1} would take you to ${fmtPct(afterSkip(a, h, budget + 1))}.`,
      };
    }
    return {
      tone: "amber",
      icon: AlertTriangle,
      title: "Right at your target, so don't skip",
      text: `You are at ${fmtPct(now)}. Skipping even one class would take you below ${t}%.`,
    };
  }
  if (Number.isFinite(need)) {
    return {
      tone: "red",
      icon: AlertTriangle,
      title: `Attend the next ${plural(need, "class")} in a row`,
      text: `You are ${round1(t - now)} points below your ${t}% target. Attending ${need} in a row brings you back to ${t}%.`,
    };
  }
  return {
    tone: "red",
    icon: XCircle,
    title: "The target can't be reached again",
    text: "A 100% target is impossible once a class has been missed. Lower the target in your setup settings to get a useful prediction.",
  };
};

// Plain-language "what if" tool for skipping or attending the next few classes.
//   rows:            subject rows from readRow(), each with `left` (class units still to happen, or null)
//   overall:         { held, attended, pct, left } across all subjects
//   target:          the setup's target percentage
//   selectedId:      "" = all subjects, otherwise a subject id
//   remainingStatus: "loading" | "ready" | "error"
const AttendancePlanner = ({ rows, overall, target, selectedId, onSelect, remainingStatus = "ready", remainingMessage = "" }) => {
  const [mode, setMode] = useState("skip"); // "skip" | "attend"
  const [rawCount, setCount] = useState(2);

  const options = [
    { id: "", name: "All subjects", color: "", held: overall?.held ?? 0, attended: overall?.attended ?? 0, pct: overall?.pct ?? null, target, left: overall?.left ?? null },
    ...rows.filter((r) => r.id),
  ];
  const cur = options.find((o) => String(o.id) === String(selectedId)) || options[0];

  const t = Number(cur.target ?? target ?? 75);
  const a = cur.attended;
  const h = cur.held;
  const left = cur.left ?? null;
  const known = left != null;
  const hasData = h > 0;

  const now = pctOf(a, h);
  const nowStatus = statusOf(now, t);
  const budget = skipBudget(a, h, t);
  const need = needToAttend(a, h, t);
  const plan = known && hasData ? semesterPlan(a, h, left, t) : null;

  const showSim = hasData && !(known && left === 0);
  const cap = known ? Math.max(1, Math.min(MAX, left)) : MAX;
  const count = Math.min(rawCount, cap);
  const setCountSafe = (n) => setCount(Math.max(1, Math.min(cap, n)));

  const afterFn = mode === "skip" ? afterSkip : afterAttend;
  const after = afterFn(a, h, count);
  const delta = after != null && now != null ? after - now : null;
  const afterTone = STATUS_META[statusOf(after, t)].tone;

  // What is still possible once this scenario has played out.
  const planAfter = known && showSim ? semesterPlan(mode === "skip" ? a : a + count, h + count, left - count, t) : null;

  const strip = Array.from({ length: cap }, (_, i) => {
    const k = i + 1;
    const p = afterFn(a, h, k);
    return { k, p, s: statusOf(p, t) };
  });

  const verdict = buildVerdict({ hasData, now, t, known, left, plan, budget, need, a, h });
  const VerdictIcon = verdict.icon;

  const thirdStat = !hasData
    ? { label: "Safe skips left", value: "-" }
    : plan
    ? { label: "You can skip", value: plan.canReach ? plan.canSkip : "-", hint: plan.canReach ? `of ${left} left` : "target out of reach" }
    : now >= t
    ? { label: "Safe skips left", value: budget === Infinity ? "Any" : budget }
    : { label: "Classes to recover", value: Number.isFinite(need) ? need : "-" };

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-[#161827]">Attendance planner</h2>
          <p className="text-[13.5px] text-[#6A6F85] mt-1 max-w-xl">
            Thinking of skipping a class? Pick a subject and see what happens to your percentage, now and by the end of the semester.
          </p>
        </div>
        <Badge tone="brand">Target {t}%</Badge>
      </div>

      {/* step 1: subject */}
      <p className="text-[13px] font-semibold text-[#161827] mt-6 mb-2">1. Choose a subject</p>
      <div className="flex gap-2 overflow-x-auto sm:flex-wrap pb-1 -mx-1 px-1">
        {options.map((o) => {
          const on = String(o.id) === String(cur.id);
          const tone = STATUS_META[statusOf(o.pct, Number(o.target ?? target ?? 75))].tone;
          return (
            <button
              key={o.id || "all"}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(o.id)}
              className={cx(
                "h-9 px-3.5 rounded-full text-[13px] font-medium border transition inline-flex items-center gap-2 shrink-0 motion-reduce:transition-none",
                FOCUS,
                on ? `${GRADIENT} border-transparent` : "bg-white/60 border-white/80 text-[#161827]/80 hover:bg-white/90"
              )}
            >
              {o.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />}
              <span className="truncate max-w-[160px]">{o.name}</span>
              {o.pct != null && (
                <span className={cx("inline-flex items-center gap-1 text-[12px]", on ? "text-white/85" : "text-[#6A6F85]")}>
                  <span className={cx("w-1.5 h-1.5 rounded-full", on ? "bg-white/85" : toneDot[tone])} />
                  {Math.round(o.pct)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* where you stand */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Stat label="Right now" value={fmtPct(now)} tone={STATUS_META[nowStatus].tone === "neutral" ? "ink" : STATUS_META[nowStatus].tone} />
        <Stat
          label="Classes counted"
          value={
            <>
              {a}
              <span className="text-[16px] text-[#6A6F85] font-medium"> of {h}</span>
            </>
          }
        />
        <Stat
          label="Classes left"
          value={known ? left : "-"}
          hint={known ? "holidays excluded" : remainingStatus === "error" ? "couldn't load" : undefined}
          loading={remainingStatus === "loading" && !known}
        />
        <Stat label={thirdStat.label} value={thirdStat.value} hint={thirdStat.hint} />
      </div>

      {remainingStatus === "error" && (
        <p className="text-[12.5px] text-amber-700 mt-3 inline-flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
          Couldn't load your upcoming classes{remainingMessage ? ` (${remainingMessage})` : ""}, so these predictions only use your current numbers.
        </p>
      )}

      <div className={cx("mt-4 rounded-2xl border px-4 py-3.5 flex gap-3", toneBox[verdict.tone])} role="status">
        <VerdictIcon className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-[15px] font-semibold">{verdict.title}</p>
          <p className="text-[13.5px] mt-1 leading-relaxed">{verdict.text}</p>
        </div>
      </div>

      {/* the rest of the semester */}
      {plan && left > 0 && (
        <div className="mt-4 rounded-2xl bg-white/60 border border-white/80 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-[#161827] inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-600" />The rest of the semester
            </p>
            <p className="text-[13px] text-[#6A6F85]">
              {plural(left, "class")} left, finishing between <b className="text-[#161827]">{fmtPct(plan.worst)}</b> and <b className="text-[#161827]">{fmtPct(plan.best)}</b>
            </p>
          </div>
          <Outlook plan={plan} now={now} t={t} />
        </div>
      )}

      {/* step 2: simulator */}
      {showSim && (
        <>
          <p className="text-[13px] font-semibold text-[#161827] mt-7 mb-2">2. Try a scenario</p>

          <div className="inline-flex p-1 rounded-full bg-white/50 border border-white/70" role="group" aria-label="Scenario type">
            {[
              { k: "skip", l: "If I skip", icon: TrendingDown },
              { k: "attend", l: "If I attend", icon: TrendingUp },
            ].map(({ k, l, icon: Icon }) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={cx(
                  "h-9 px-4 rounded-full text-[13.5px] font-medium inline-flex items-center gap-2 transition motion-reduce:transition-none",
                  FOCUS,
                  mode === k ? GRADIENT : "text-[#161827]/70 hover:bg-white/70"
                )}
              >
                <Icon className="w-4 h-4" />
                {l}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="inline-flex items-center gap-1 rounded-full bg-white/60 border border-white/80 p-1">
              <button type="button" aria-label="One less" onClick={() => setCountSafe(count - 1)} disabled={count <= 1} className={cx("w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/90 disabled:opacity-40", FOCUS)}>
                <Minus className="w-4 h-4" />
              </button>
              <span className="min-w-[88px] text-center text-[14px] font-semibold text-[#161827]" aria-live="polite">{plural(count, "class")}</span>
              <button type="button" aria-label="One more" onClick={() => setCountSafe(count + 1)} disabled={count >= cap} className={cx("w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/90 disabled:opacity-40", FOCUS)}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <input
              type="range"
              min="1"
              max={cap}
              value={count}
              disabled={cap === 1}
              onChange={(e) => setCountSafe(Number(e.target.value))}
              aria-label="Number of classes"
              className="flex-1 min-w-[160px] accent-indigo-600"
            />
          </div>
          {known && left > MAX && (
            <p className="text-[12px] text-[#6A6F85] mt-2">Scenarios go up to {MAX} classes. Your whole semester outlook is shown above.</p>
          )}

          <div className="mt-5 rounded-3xl bg-white/55 border border-white/80 p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <p className="text-[12.5px] text-[#6A6F85]">Before</p>
                <p className="text-[30px] font-semibold text-[#161827] leading-tight">{fmtPct(now)}</p>
              </div>
              <ArrowRight className="w-6 h-6 text-[#6A6F85]" aria-hidden="true" />
              <div>
                <p className="text-[12.5px] text-[#6A6F85]">After</p>
                <p className={cx("text-[30px] font-semibold leading-tight", toneText[afterTone])}>{fmtPct(after)}</p>
              </div>
              {delta != null && (
                <Badge tone={delta < 0 ? "red" : delta > 0 ? "green" : "neutral"}>
                  {delta > 0 ? "+" : ""}
                  {round1(delta)} pts
                </Badge>
              )}
            </div>

            <div className="mt-4">
              <ProgressBar value={after || 0} target={t} />
              <p className="text-[12px] text-[#6A6F85] mt-1.5">The dark tick marks your {t}% target.</p>
            </div>

            <p className="text-[14px] text-[#161827] mt-4 leading-relaxed">
              {mode === "skip" ? (
                <>If you skip the next {plural(count, "class")}, you will have attended <b>{a}</b> of <b>{h + count}</b> = <b>{fmtPct(after)}</b>. </>
              ) : (
                <>If you attend the next {plural(count, "class")}, you will have attended <b>{a + count}</b> of <b>{h + count}</b> = <b>{fmtPct(after)}</b>. </>
              )}
              {after >= t ? `That is ${round1(after - t)} points above your target.` : `That is ${round1(t - after)} points below your target.`}
            </p>

            {planAfter && (
              <p className="text-[13px] text-[#444A63] mt-2 leading-relaxed">
                {left - count === 0
                  ? "That would use up every remaining class."
                  : planAfter.canReach
                  ? `After that, ${plural(left - count, "class")} would be left. You would need to attend ${planAfter.mustAttend} of them and could skip ${planAfter.canSkip}.`
                  : `After that, even attending all ${plural(left - count, "remaining class")} would leave you at ${fmtPct(planAfter.best)}, below ${t}%.`}
              </p>
            )}
          </div>

          {/* quick glance strip */}
          <p className="text-[13px] font-semibold text-[#161827] mt-6 mb-2">{mode === "skip" ? "What each extra skip costs" : "How fast attending helps"}</p>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {strip.map(({ k, p, s }) => (
              <button
                key={k}
                type="button"
                onClick={() => setCountSafe(k)}
                className={cx(
                  "rounded-2xl border px-1 py-2 text-center transition motion-reduce:transition-none",
                  FOCUS,
                  toneBox[STATUS_META[s].tone],
                  k === count ? "ring-2 ring-indigo-400" : "hover:brightness-95"
                )}
                aria-label={`${plural(k, "class")}: ${fmtPct(p)}`}
                aria-pressed={k === count}
              >
                <span className="block text-[11px] opacity-75">{k}</span>
                <span className="block text-[13px] font-semibold">{p == null ? "-" : `${Math.round(p)}%`}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12px] text-[#6A6F85]">
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5" />At or above target</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5" />Within 3 points of it</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5" />Below target</span>
          </div>
        </>
      )}

      <details className="mt-6 group">
        <summary className={cx("cursor-pointer text-[13px] font-medium text-indigo-600 inline-flex items-center gap-1.5 select-none rounded", FOCUS)}>
          <Info className="w-4 h-4" />How is this calculated?
        </summary>
        <ul className="mt-3 space-y-1.5 text-[13px] text-[#444A63] list-disc pl-5 leading-relaxed">
          <li>Percentage = classes attended / classes held x 100. Counts are in class units, so a 2-unit lab counts twice.</li>
          <li>Only classes marked present or absent are counted. Pending, excused and cancelled classes do not change your percentage.</li>
          <li>Classes left = classes still pending from today to the end of the semester. Holidays and cancelled classes are already removed. A holiday saved as a draft cancels nothing until you confirm it.</li>
          <li>Best finish = you attend every class left. Worst finish = you skip every class left.</li>
          <li>You must attend = the fewest of the classes left that still gets you to your target by the end. You can skip = the rest.</li>
          <li>If a class you planned to skip is later cancelled, it will not count against you either way.</li>
        </ul>
      </details>
    </Card>
  );
};

export default AttendancePlanner;