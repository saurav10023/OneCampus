import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, CalendarClock, Calculator, RefreshCw, Undo2 } from "lucide-react";
import { attendanceApi, extraApi, errMsg } from "../api/endpoints";
import { STATUS_META, overallOf, plural, readRow, rowsOf, semesterPlan, statusOf, toneBox, toneText } from "../lib/attendance";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, PageSpinner, ProgressBar, cx } from "../components/Ui";
import Ring from "../components/Ring";
import AttendancePlanner from "../components/AttendancePlanner";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400";

const Pill = ({ tone = "neutral", children }) => (
  <span className={cx("inline-flex items-center h-6 px-2.5 rounded-full border text-[12px] font-medium", toneBox[tone])}>{children}</span>
);

const Stat = ({ label, value, hint, loading }) => (
  <div className="rounded-2xl bg-white/60 border border-white/80 px-4 py-3">
    <p className="text-[12.5px] text-[#6A6F85]">{label}</p>
    <div className="text-[24px] font-semibold leading-tight mt-0.5 text-[#161827]">
      {loading ? <span className="inline-block h-6 w-12 rounded-lg bg-[#161827]/10 animate-pulse align-middle motion-reduce:animate-none" /> : value}
    </div>
    {hint && <p className="text-[12px] text-[#6A6F85] mt-0.5">{hint}</p>}
  </div>
);

// One line about the rest of the semester for a subject card.
const leftLine = (left, plan, t) => {
  if (left == null) return null;
  if (left === 0) return { tone: "neutral", text: "No classes left" };
  if (!plan) return { tone: "neutral", text: `${plural(left, "class")} left` };
  if (!plan.canReach) return { tone: "red", text: `${plural(left, "class")} left. Best finish ${Math.round(plan.best)}%, below target` };
  if (plan.canSkip > 0) return { tone: "green", text: `${plural(left, "class")} left. You can skip ${plan.canSkip}` };
  return { tone: "amber", text: `${plural(left, "class")} left. Attend all of them` };
};

const Attendance = () => {
  const { setup } = useOutletContext();
  const setupId = setup._id;
  const target = setup.targetPercentage ?? 75;

  const [data, setData] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "attention"

  // college record (ERP) match
  const [erp, setErp] = useState(null); // row being matched
  const [erpForm, setErpForm] = useState({ attended: "", held: "", note: "" });
  const [erpBusy, setErpBusy] = useState(false);
  const [erpError, setErpError] = useState("");
  const [erpResult, setErpResult] = useState(null); // { subject, res }

  // planner
  const [plannerSubject, setPlannerSubject] = useState("");
  const plannerRef = useRef(null);

  // classes still to happen (holidays and cancelled classes already excluded by the server)
  const remaining = useRemainingClasses(setup);
  const remainingReady = remaining.status === "ready";

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await attendanceApi.overview(setupId, showArchived));
    } catch (e) {
      setError(errMsg(e, "Could not load attendance"));
    } finally {
      setLoading(false);
    }
  }, [setupId, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => rowsOf(data).map(readRow).map((r) => ({ ...r, left: remainingReady ? remaining.bySubject[String(r.id)] || 0 : null })),
    [data, remaining.bySubject, remainingReady]
  );

  const overall = useMemo(() => {
    if (!data) return null;
    const o = overallOf(data);
    // summed over the visible rows, so the "Include archived subjects" toggle is respected
    const left = remainingReady ? rows.reduce((s, r) => s + (r.left || 0), 0) : null;
    return { ...o, left };
  }, [data, rows, remainingReady]);

  const overallStatus = statusOf(overall?.pct, target);
  const overallTone = STATUS_META[overallStatus].tone;
  const overallPlan = overall && overall.left != null && overall.held > 0 ? semesterPlan(overall.attended, overall.held, overall.left, target) : null;

  // per-subject plans, and which subjects need attention
  const cards = rows.map((r) => {
    const t = Number(r.target ?? target);
    const status = statusOf(r.pct, t);
    const plan = r.left != null && r.held > 0 ? semesterPlan(r.attended, r.held, r.left, t) : null;
    const attention = status === "below" || status === "close" || (plan != null && r.left > 0 && !plan.canReach);
    return { r, t, status, plan, attention };
  });
  const attentionCount = cards.filter((c) => c.attention).length;
  const visible = filter === "attention" ? cards.filter((c) => c.attention) : cards;

  const openErp = (r) => {
    setErp(r);
    setErpForm({ attended: "", held: "", note: "" });
    setErpError("");
  };

  const matchErp = async (e) => {
    e.preventDefault();
    const attended = Number(erpForm.attended);
    const held = Number(erpForm.held);
    if (!(held > 0) || attended < 0 || attended > held) return setErpError("Attended must be between 0 and the total held.");
    setErpBusy(true);
    setErpError("");
    try {
      const res = await extraApi.matchCollege(setupId, erp.id, { collegeAttended: attended, collegeHeld: held, note: erpForm.note.trim() || undefined });
      setErpResult({ subject: erp, res });
      setErp(null);
      await load();
    } catch (err) {
      setErpError(errMsg(err, "Could not match the college record"));
    } finally {
      setErpBusy(false);
    }
  };

  // Undo restores the record as it was. If the subject had no record before
  // (previous is null), the correct undo is to delete the record.
  const undoErp = async () => {
    const { subject, res } = erpResult;
    try {
      if (res.previous) await extraApi.set(setupId, subject.id, res.previous);
      else await extraApi.remove(setupId, subject.id);
      setErpResult(null);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not undo"));
    }
  };

  const planSubject = (id) => {
    setPlannerSubject(id);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    plannerRef.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  };

  if (loading && !data) return <PageSpinner />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <PageHeader
        title="Attendance"
        subtitle={`Target ${target}% - ${setup.name}`}
        action={
          <label className="flex items-center gap-2 text-[13px] text-[#161827]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
            Include archived subjects
          </label>
        }
      />

      <Alert type="error" className="mb-5">{error}</Alert>

      {erpResult && (
        <Alert type="success" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>
            {erpResult.res.changed === false ? "Already in sync with the college record." : `Matched ${erpResult.subject.name} to your college record.`}
          </span>
          {erpResult.res.changed !== false && (
            <Button size="sm" variant="glass" onClick={undoErp}><Undo2 className="w-4 h-4" />Undo</Button>
          )}
        </Alert>
      )}

      {/* overall */}
      {overall?.pct != null && (
        <Card className="p-6 sm:p-7 mb-6">
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <Ring value={overall.pct} target={target} tone={overallTone} size={140}>
              <span className="text-[28px] font-semibold text-[#161827] leading-none">{overall.pct}%</span>
              <span className="text-[11.5px] text-[#6A6F85] mt-1">of {target}% goal</span>
            </Ring>
            <div className="flex-1 min-w-[220px]">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-semibold text-[#161827]">Overall attendance</h2>
                <Pill tone={overallTone}>{STATUS_META[overallStatus].label}</Pill>
              </div>
              <p className="text-[13.5px] text-[#6A6F85] mt-1">{overall.attended} of {overall.held} classes attended</p>
              <div className="mt-4"><ProgressBar value={overall.pct} target={target} /></div>
            </div>
          </div>

          {remaining.status !== "error" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <Stat label="Classes left" value={overall.left ?? "-"} hint="holidays excluded" loading={remaining.status === "loading"} />
              <Stat
                label="You can skip"
                value={overallPlan ? (overallPlan.canReach ? overallPlan.canSkip : "-") : "-"}
                hint={overallPlan ? (overallPlan.canReach ? `of ${overall.left} left` : "target out of reach") : undefined}
                loading={remaining.status === "loading"}
              />
              <Stat
                label="You must attend"
                value={overallPlan ? (overallPlan.canReach ? overallPlan.mustAttend : "-") : "-"}
                hint={overallPlan?.canReach ? `to finish at ${target}%` : undefined}
                loading={remaining.status === "loading"}
              />
              <Stat
                label="Likely range"
                value={overallPlan ? `${Math.round(overallPlan.worst)}-${Math.round(overallPlan.best)}%` : "-"}
                hint="skip all to attend all"
                loading={remaining.status === "loading"}
              />
            </div>
          ) : (
            <p className="text-[12.5px] text-amber-700 mt-5 inline-flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
              Couldn't load your upcoming classes{remaining.message ? ` (${remaining.message})` : ""}, so end-of-semester numbers are hidden.
            </p>
          )}
        </Card>
      )}

      {/* subjects */}
      {rows.length === 0 ? (
        <EmptyState icon={Calculator} title="Nothing to show yet" text="Add subjects and weekly classes, then mark attendance from your dashboard." />
      ) : (
        <>
          {rows.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Filter subjects">
              {[
                { k: "all", l: `All subjects (${rows.length})` },
                { k: "attention", l: `Needs attention (${attentionCount})` },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                  className={cx(
                    "h-9 px-4 rounded-full text-[13px] font-medium border transition motion-reduce:transition-none",
                    FOCUS,
                    filter === k
                      ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent shadow-md shadow-indigo-500/25"
                      : "bg-white/60 border-white/80 text-[#161827]/80 hover:bg-white/90"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-[15px] font-semibold text-[#161827]">Every subject is on track</p>
              <p className="text-[13.5px] text-[#6A6F85] mt-1">Nothing is below target or at risk of getting there.</p>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {visible.map(({ r, t, status, plan }) => {
                const meta = STATUS_META[status];
                const line = leftLine(r.left, plan, t);
                return (
                  <Card key={r.id || r.name} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15.5px] font-semibold text-[#161827] truncate flex items-center gap-2">
                          {r.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
                          {r.name}
                        </p>
                        {r.code && <p className="text-[12.5px] text-[#6A6F85]">{r.code}</p>}
                      </div>
                      <p className={cx("text-[22px] font-semibold", toneText[meta.tone])}>{r.pct == null ? "-" : `${r.pct}%`}</p>
                    </div>

                    <div className="mt-3"><ProgressBar value={r.pct || 0} target={t} /></div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Badge>{r.attended}/{r.held} classes</Badge>
                      {r.held > 0 && <Pill tone={meta.tone}>{meta.label}</Pill>}
                    </div>

                    {line && (
                      <p className={cx("text-[13px] mt-3 inline-flex items-start gap-1.5", toneText[line.tone])}>
                        <CalendarClock className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
                        {line.text}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-1 mt-3 -ml-2">
                      {r.id && (
                        <Button size="sm" variant="ghost" onClick={() => planSubject(r.id)}>
                          <Calculator className="w-4 h-4" />Plan
                        </Button>
                      )}
                      {r.id && (
                        <Button size="sm" variant="ghost" onClick={() => openErp(r)}>
                          <RefreshCw className="w-4 h-4" />Match college ERP
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* attendance planner (replaces the old bunk calculator) */}
      <div ref={plannerRef} className="mt-8 scroll-mt-6">
        <AttendancePlanner
          rows={rows}
          overall={overall}
          target={target}
          selectedId={plannerSubject}
          onSelect={setPlannerSubject}
          remainingStatus={remaining.status}
          remainingMessage={remaining.message}
        />
      </div>

      <Modal open={Boolean(erp)} onClose={() => setErp(null)} title={`Match college ERP: ${erp?.name || ""}`}>
        <form onSubmit={matchErp} className="space-y-4">
          <p className="text-[13.5px] text-[#6A6F85]">Enter the numbers your college portal shows. We add the difference as extra classes so both match.</p>
          <Alert type="error">{erpError}</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Attended (college)" type="number" min="0" value={erpForm.attended} onChange={(e) => setErpForm({ ...erpForm, attended: e.target.value })} required />
            <Field label="Held (college)" type="number" min="1" value={erpForm.held} onChange={(e) => setErpForm({ ...erpForm, held: e.target.value })} required />
          </div>
          <Field label="Note (optional)" value={erpForm.note} onChange={(e) => setErpForm({ ...erpForm, note: e.target.value })} placeholder="Synced with ERP on 24 Oct" />
          <Button type="submit" loading={erpBusy}>Match records</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Attendance;