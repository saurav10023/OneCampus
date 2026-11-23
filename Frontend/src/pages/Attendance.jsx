import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, CalendarClock, Calculator, CheckCircle2, ChevronDown, RefreshCw, Undo2 } from "lucide-react";
import { attendanceApi, extraApi, errMsg } from "../api/endpoints";
import { STATUS_META, overallOf, plural, readRow, rowsOf, semesterPlan, statusOf, toneBox, toneText } from "../lib/attendance";
import { useRemainingClasses } from "../lib/useRemainingClasses";
import { Alert, Button, Card, EmptyState, Field, Modal, PageHeader, PageSpinner, ProgressBar, cx } from "../components/Ui";
import Ring from "../components/Ring";
import AttendancePlanner from "../components/AttendancePlanner";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1";

const Pill = ({ tone = "neutral", children, className }) => (
  <span className={cx("inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold", toneBox[tone], className)}>{children}</span>
);

/* A hairline-divided strip of small stats. Cells share borders, so it reads as one sleek unit. */
const StatStrip = ({ items, loading, cols = "grid-cols-2 @2xl:grid-cols-4" }) => (
  <div className={cx("grid gap-px overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--line)]", cols)}>
    {items.map((s) => (
      <div key={s.label} className="min-w-0 bg-[color:var(--surface)] px-3 py-2.5">
        <p className="truncate text-[12px] font-medium text-[color:var(--muted)]">{s.label}</p>
        <p className={cx("mt-0.5 text-[20px] font-semibold leading-tight tabular-nums", s.tone || "text-[color:var(--ink)]")}>
          {loading ? <span className="inline-block h-5 w-10 animate-pulse rounded-md bg-[color:var(--line-soft)] align-middle motion-reduce:animate-none" /> : s.value}
        </p>
        {s.hint && <p className="truncate text-[11.5px] text-[color:var(--muted)]">{s.hint}</p>}
      </div>
    ))}
  </div>
);

/* One short line for the collapsed subject row. */
const shortInfo = (r, plan) => {
  if (r.left == null || r.held === 0) return { tone: "neutral", text: `${r.attended}/${r.held} classes` };
  if (r.left === 0) return { tone: "neutral", text: "No classes left" };
  if (!plan) return { tone: "neutral", text: `${plural(r.left, "class")} left` };
  if (!plan.canReach) return { tone: "red", text: `Out of reach, best ${Math.round(plan.best)}%` };
  if (plan.canSkip > 0) return { tone: "green", text: `Can skip ${plan.canSkip} of ${r.left}` };
  return { tone: "amber", text: `Attend all ${r.left} left` };
};

/* Longer line for the expanded card. */
const leftLine = (left, plan) => {
  if (left == null) return null;
  if (left === 0) return { tone: "neutral", text: "No classes left" };
  if (!plan) return { tone: "neutral", text: `${plural(left, "class")} left` };
  if (!plan.canReach) return { tone: "red", text: `${plural(left, "class")} left. Best finish ${Math.round(plan.best)}%, below target` };
  if (plan.canSkip > 0) return { tone: "green", text: `${plural(left, "class")} left. You can skip ${plan.canSkip}` };
  return { tone: "amber", text: `${plural(left, "class")} left. Attend all of them` };
};

/* Why a subject is critical, in one sentence. */
const criticalLine = (c) => {
  const { r, t, plan } = c;
  if (plan && r.left > 0 && !plan.canReach) return `Out of reach: best finish is ${Math.round(plan.best)}% against ${t}%.`;
  if (plan && plan.canReach && plan.mustAttend > 0) return `Below ${t}%. Attend ${plan.mustAttend} of the next ${r.left} classes to recover.`;
  return `${r.pct}% against a ${t}% target.`;
};

const CSS = `
@keyframes att-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.att-in{animation:att-in .22s cubic-bezier(0.32,0.72,0,1) both}
@media (prefers-reduced-motion:reduce){.att-in{animation:none}}
`;

const Attendance = () => {
  const { setup } = useOutletContext();
  const setupId = setup._id;
  const target = setup.targetPercentage ?? 75;

  const [data, setData] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "critical"
  const [openIds, setOpenIds] = useState(() => new Set());
  const [showCritical, setShowCritical] = useState(false);

  // college record (ERP) match
  const [erp, setErp] = useState(null);
  const [erpForm, setErpForm] = useState({ attended: "", held: "", note: "" });
  const [erpBusy, setErpBusy] = useState(false);
  const [erpError, setErpError] = useState("");
  const [erpResult, setErpResult] = useState(null);

  // planner
  const [plannerSubject, setPlannerSubject] = useState("");
  const plannerRef = useRef(null);
  const criticalRef = useRef(null);

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
    const left = remainingReady ? rows.reduce((s, r) => s + (r.left || 0), 0) : null;
    return { ...o, left };
  }, [data, rows, remainingReady]);

  const overallStatus = statusOf(overall?.pct, target);
  const overallTone = STATUS_META[overallStatus].tone;
  const overallPlan = overall && overall.left != null && overall.held > 0 ? semesterPlan(overall.attended, overall.held, overall.left, target) : null;

  // per-subject plans. Critical = below target, or target can no longer be reached.
  const cards = useMemo(
    () =>
      rows.map((r) => {
        const t = Number(r.target ?? target);
        const status = statusOf(r.pct, t);
        const plan = r.left != null && r.held > 0 ? semesterPlan(r.attended, r.held, r.left, t) : null;
        const critical = status === "below" || (plan != null && r.left > 0 && !plan.canReach);
        return { key: String(r.id || r.name), r, t, status, plan, critical };
      }),
    [rows, target]
  );
  const critical = useMemo(() => cards.filter((c) => c.critical).sort((a, b) => (a.r.pct ?? 0) - (b.r.pct ?? 0)), [cards]);
  const visible = filter === "critical" ? cards.filter((c) => c.critical) : cards;
  const allOpen = visible.length > 0 && visible.every((c) => openIds.has(c.key));

  const toggle = (key) =>
    setOpenIds((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  const toggleAll = () => setOpenIds(allOpen ? new Set() : new Set(visible.map((c) => c.key)));

  const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const planSubject = (id) => {
    setPlannerSubject(id);
    plannerRef.current?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
  };

  // opening the critical section brings it into view
  useEffect(() => {
    if (showCritical) criticalRef.current?.scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "nearest" });
  }, [showCritical]);
  // if nothing is critical any more, drop the section and the filter
  useEffect(() => {
    if (critical.length === 0) {
      setShowCritical(false);
      setFilter((f) => (f === "critical" ? "all" : f));
    }
  }, [critical.length]);

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

  // Undo restores the record as it was. If the subject had no record before, delete the record.
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

  if (loading && !data) return <PageSpinner />;

  const names = critical.slice(0, 2).map((c) => c.r.name).join(", ");
  const extra = critical.length - 2;
  const statsLoading = remaining.status === "loading";

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 min-[380px]:px-3.5 sm:px-6 sm:py-10 xl:max-w-7xl">
      <style>{CSS}</style>

      <PageHeader
        title="Attendance"
        subtitle={`Target ${target}% - ${setup.name}`}
        action={
          <label className={cx("inline-flex min-h-11 items-center gap-2 rounded-lg text-[13px] text-[color:var(--body)]", FOCUS)}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            Include archived subjects
          </label>
        }
      />

      <Alert type="error" className="mb-4 sm:mb-5">{error}</Alert>

      {erpResult && (
        <Alert type="success" className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5">
          <span className="min-w-0">
            {erpResult.res.changed === false ? "Already in sync with the college record." : `Matched ${erpResult.subject.name} to your college record.`}
          </span>
          {erpResult.res.changed !== false && (
            <Button size="sm" variant="glass" onClick={undoErp}><Undo2 className="h-4 w-4" />Undo</Button>
          )}
        </Alert>
      )}

      {/* ---------------- overall (compact) ---------------- */}
      {overall?.pct != null && (
        <Card className="@container mb-3 p-3.5 min-[380px]:p-4 sm:mb-4 sm:p-5">
          <div className="flex items-center gap-4 sm:gap-6">
            <Ring value={overall.pct} target={target} tone={overallTone} size={96}>
              <span className="text-[22px] font-semibold leading-none text-[color:var(--ink)]">{overall.pct}%</span>
              <span className="mt-1 text-[11px] text-[color:var(--muted)]">of {target}%</span>
            </Ring>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-[17px] font-semibold text-[color:var(--ink)]">Overall attendance</h2>
                <Pill tone={overallTone}>{STATUS_META[overallStatus].label}</Pill>
              </div>
              <p className="mt-0.5 text-[13px] text-[color:var(--muted)] tabular-nums">{overall.attended} of {overall.held} classes attended</p>
              <div className="mt-2.5"><ProgressBar value={overall.pct} target={target} /></div>
            </div>
          </div>

          {remaining.status !== "error" ? (
            <div className="mt-4">
              <StatStrip
                loading={statsLoading}
                items={[
                  { label: "Classes left", value: overall.left ?? "-", hint: "holidays excluded" },
                  { label: "Can skip", value: overallPlan?.canReach ? overallPlan.canSkip : "-", hint: overallPlan ? (overallPlan.canReach ? `of ${overall.left} left` : "target out of reach") : undefined, tone: overallPlan?.canReach && overallPlan.canSkip > 0 ? "text-emerald-600" : undefined },
                  { label: "Must attend", value: overallPlan?.canReach ? overallPlan.mustAttend : "-", hint: overallPlan?.canReach ? `to finish at ${target}%` : undefined },
                  { label: "Likely range", value: overallPlan ? `${Math.round(overallPlan.worst)}-${Math.round(overallPlan.best)}%` : "-", hint: "skip all to attend all" },
                ]}
              />
            </div>
          ) : (
            <p className="mt-4 inline-flex items-start gap-1.5 text-[12.5px] text-amber-700">
              <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">Couldn't load your upcoming classes{remaining.message ? ` (${remaining.message})` : ""}, so end-of-semester numbers are hidden.</span>
            </p>
          )}

          {/* critical subjects callout */}
          {critical.length > 0 ? (
            <div className={cx("mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5", toneBox.red)}>
              <p className="flex min-w-0 flex-1 basis-48 items-start gap-2 text-[13px]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-semibold">{plural(critical.length, "critical subject")}</span>
                  <span className="block truncate opacity-90">{names}{extra > 0 ? ` +${extra} more` : ""}</span>
                </span>
              </p>
              <Button size="sm" variant="glass" onClick={() => setShowCritical((v) => !v)} aria-expanded={showCritical} aria-controls="critical-section">
                {showCritical ? "Hide" : "Review"}
                <ChevronDown className={cx("h-4 w-4 transition-transform motion-reduce:transition-none", showCritical && "rotate-180")} aria-hidden="true" />
              </Button>
            </div>
          ) : (
            cards.length > 0 && (
              <p className={cx("mt-3 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium", toneBox.green)}>
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />All subjects are on track
              </p>
            )
          )}
        </Card>
      )}

      {/* ---------------- critical subjects ---------------- */}
      {showCritical && critical.length > 0 && (
        <section id="critical-section" ref={criticalRef} className="att-in mb-3 scroll-mt-6 sm:mb-4" aria-label="Critical subjects">
          <Card className="p-3.5 min-[380px]:p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-[17px] font-semibold text-[color:var(--ink)]">Critical subjects</h2>
              <p className="text-[12.5px] text-[color:var(--muted)]">Below target or out of reach. Lowest first.</p>
            </div>
            <ul className="mt-3 space-y-2">
              {critical.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[color:var(--inset)] p-3">
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="flex items-center gap-2 text-[14.5px] font-semibold text-[color:var(--ink)]">
                      {c.r.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.r.color }} />}
                      <span className="truncate">{c.r.name}</span>
                      <span className={cx("ml-auto shrink-0 tabular-nums", toneText.red)}>{c.r.pct == null ? "-" : `${c.r.pct}%`}</span>
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">{criticalLine(c)}</p>
                  </div>
                  {c.r.id && (
                    <Button size="sm" variant="glass" onClick={() => planSubject(c.r.id)} className="w-full sm:w-auto">
                      <Calculator className="h-4 w-4" />Open in planner
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ---------------- subjects ---------------- */}
      {rows.length === 0 ? (
        <EmptyState icon={Calculator} title="Nothing to show yet" text="Add subjects and weekly classes, then mark attendance from your dashboard." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
            {rows.length > 1 && (
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter subjects">
                {[
                  { k: "all", l: `All (${rows.length})` },
                  ...(critical.length > 0 ? [{ k: "critical", l: `Critical (${critical.length})` }] : []),
                ].map(({ k, l }) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                    className={cx(
                      "min-h-11 rounded-full border px-4 text-[13px] font-medium tabular-nums transition-colors active:scale-[0.98] motion-reduce:transition-none sm:min-h-9",
                      FOCUS,
                      filter === k
                        ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                        : "border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--body)] hover:bg-[color:var(--inset)]"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            {visible.length > 1 && (
              <button
                type="button"
                onClick={toggleAll}
                className={cx("ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[color:var(--body)] hover:text-[color:var(--ink)] sm:min-h-9", FOCUS)}
              >
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <Card className="p-5 text-center">
              <p className="text-[15px] font-semibold text-[color:var(--ink)]">Every subject is on track</p>
              <p className="mt-1 text-[13.5px] text-[color:var(--muted)]">Nothing is below target or out of reach.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 items-start gap-2 sm:gap-3 md:grid-cols-2">
              {visible.map(({ key, r, t, status, plan, critical: isCritical }) => {
                const meta = STATUS_META[status];
                const info = shortInfo(r, plan);
                const line = leftLine(r.left, plan);
                const isOpen = openIds.has(key);
                const panelId = `subject-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`;
                return (
                  <Card key={key} className={cx("min-w-0 overflow-hidden p-0", isCritical && "border-l-4 border-l-rose-500")}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className={cx("flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[color:var(--inset)] motion-reduce:transition-none sm:px-4", FOCUS)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />}
                          <span className="truncate text-[15px] font-semibold text-[color:var(--ink)]">{r.name}</span>
                        </span>
                        <span className={cx("mt-0.5 block truncate text-[12.5px]", toneText[info.tone])}>
                          {info.text}
                          {r.code ? <span className="text-[color:var(--muted)]"> · {r.code}</span> : null}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cx("text-[20px] font-semibold leading-none tabular-nums", toneText[meta.tone])}>{r.pct == null ? "-" : `${r.pct}%`}</span>
                        {r.held > 0 && <Pill tone={meta.tone} className="h-5 px-2 text-[11px]">{meta.label}</Pill>}
                      </span>
                      <ChevronDown className={cx("h-5 w-5 shrink-0 text-[color:var(--muted)] transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden="true" />
                    </button>

                    {/* thin progress line stays visible when collapsed */}
                    {!isOpen && (
                      <div className="px-3.5 pb-3 sm:px-4">
                        <ProgressBar value={r.pct || 0} target={t} />
                      </div>
                    )}

                    {isOpen && (
                      <div id={panelId} className="att-in border-t border-[color:var(--line-soft)] px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4">
                        <ProgressBar value={r.pct || 0} target={t} />
                        <div className="mt-3">
                          <StatStrip
                            cols="grid-cols-2 sm:grid-cols-4"
                            items={[
                              { label: "Attended", value: `${r.attended}/${r.held}` },
                              { label: "Target", value: `${t}%` },
                              { label: "Left", value: r.left ?? "-" },
                              plan?.canReach && r.left > 0
                                ? plan.canSkip > 0
                                  ? { label: "Can skip", value: plan.canSkip, tone: "text-emerald-600" }
                                  : { label: "Must attend", value: plan.mustAttend }
                                : { label: "Best finish", value: plan ? `${Math.round(plan.best)}%` : "-" },
                            ]}
                          />
                        </div>

                        {line && (
                          <p className={cx("mt-3 inline-flex items-start gap-1.5 text-[13px]", toneText[line.tone])}>
                            <CalendarClock className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="min-w-0">{line.text}</span>
                          </p>
                        )}

                        {r.id && (
                          <div className="-ml-2 mt-3 flex flex-wrap items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => planSubject(r.id)}>
                              <Calculator className="h-4 w-4" />Plan
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openErp(r)}>
                              <RefreshCw className="h-4 w-4" />Match college ERP
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* attendance planner */}
      <div ref={plannerRef} className="mt-6 scroll-mt-6 sm:mt-8">
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
        <form onSubmit={matchErp} className="@container min-w-0 space-y-4">
          <p className="text-[13.5px] text-[color:var(--muted)]">Enter the numbers your college portal shows. We add the difference as extra classes so both match.</p>
          <Alert type="error">{erpError}</Alert>
          <div className="grid min-w-0 grid-cols-1 gap-4 @sm:grid-cols-2">
            <Field label="Attended (college)" type="number" min="0" value={erpForm.attended} onChange={(e) => setErpForm({ ...erpForm, attended: e.target.value })} required />
            <Field label="Held (college)" type="number" min="1" value={erpForm.held} onChange={(e) => setErpForm({ ...erpForm, held: e.target.value })} required />
          </div>
          <Field label="Note (optional)" value={erpForm.note} onChange={(e) => setErpForm({ ...erpForm, note: e.target.value })} placeholder="Synced with ERP on 24 Oct" />
          <Button type="submit" loading={erpBusy} className="w-full @sm:w-auto">Match records</Button>
        </form>
      </Modal>
    </div>
  );
};

export default Attendance;