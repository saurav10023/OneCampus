import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarRange, CheckCircle2, Check, Link2, Unlink } from "lucide-react";
import { officialApi, errMsg } from "../api/endpoints";
import { Alert, Button, Card, EmptyState, Modal, PageSpinner, Summary, cx, Warnings } from "./Ui";

const idOf = (s) => s?._id || s?.id;
const titleOf = (s) =>
  [s.branch, s.section && `Section ${s.section}`, s.semesterLabel, s.academicYear].filter(Boolean).join(" - ") || "Official schedule";

// "2026-08-01" -> "1 Aug 2026"
const fmt = (s) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const rangeText = (a, b) => (a && b ? `${fmt(a)} to ${fmt(b)}` : a ? `From ${fmt(a)}` : b ? `Until ${fmt(b)}` : "");

const STEPS = ["Select schedule", "Preview changes", "Confirm and join"];

const StepIndicator = ({ current }) => (
  <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Progress">
    {STEPS.map((label, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
          <span
            className={cx(
              "w-6 h-6 rounded-full text-[12px] font-semibold flex items-center justify-center transition",
              done || active ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0]" : "bg-[#161827]/10 text-[#161827]/55"
            )}
          >
            {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </span>
          <span className={cx("text-[13px]", active ? "font-semibold text-[#161827]" : "text-[#6A6F85]")}>{label}</span>
        </li>
      );
    })}
  </ol>
);

const SectionLabel = ({ children, hint }) => (
  <div className="mb-2">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85]">{children}</p>
    {hint && <p className="text-[13px] text-[#6A6F85] mt-0.5">{hint}</p>}
  </div>
);

// Semester dates in the preview: what they are now, what they become, and what that does to classes.
// `change` is null when joining leaves the dates as they are.
const DatesPanel = ({ change, schedule }) => {
  const scheduleHasDates = Boolean(schedule?.semesterStart || schedule?.semesterEnd);

  if (!change) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-white/60 border border-white/80 p-4">
        <CalendarRange className="w-5 h-5 mt-0.5 text-[#6A6F85] shrink-0" aria-hidden="true" />
        <div>
          <p className="text-[14px] font-semibold text-[#161827]">Semester dates stay the same</p>
          <p className="text-[13px] text-[#6A6F85] mt-0.5">
            {scheduleHasDates ? "Your dates already match the official schedule." : "The official schedule has no dates set, so yours are kept."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-indigo-500/[0.07] border border-indigo-200/70 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarRange className="w-5 h-5 text-indigo-600" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-[#161827]">Your semester dates will change</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px]">
        <span className="rounded-xl bg-white/70 border border-white px-3 py-1.5 text-[#6A6F85] line-through decoration-[#6A6F85]/50">
          {rangeText(change.from?.startDate, change.from?.endDate)}
        </span>
        <ArrowRight className="w-4 h-4 text-indigo-600 shrink-0" aria-hidden="true" />
        <span className="rounded-xl bg-white border border-indigo-200 px-3 py-1.5 font-semibold text-[#161827]">
          {rangeText(change.to?.startDate, change.to?.endDate)}
        </span>
      </div>
      <p className="text-[12.5px] text-[#6A6F85] mt-3">
        This follows the official schedule and happens only now, when you join. Your own classes are adjusted to fit.
      </p>
      {change.classesLeftOut > 0 && (
        <p className="text-[13px] text-[#8A5A00] bg-amber-500/10 border border-amber-300/60 rounded-xl px-3 py-2 mt-3">
          {change.classesLeftOut} of your classes
          {change.markedClassesLeftOut > 0 ? ` (${change.markedClassesLeftOut} with attendance marked)` : ""} fall outside the new dates. They stop
          counting toward your attendance. Nothing is deleted, and the marks come back if the dates are widened again.
        </p>
      )}
    </div>
  );
};

// Join / leave a schedule published by your Class Representative (CR).
//   onJoined: called when the student presses "Continue" after seeing the join result
//
// Joining cancels and locks the classes the schedule cancels, and moves your semester dates to the
// official ones (when the schedule sets them). The server requires `confirm: true`, so the student
// must preview the effect and tick the confirmation box before the Join button works.
const OfficialJoin = ({ setupId, readOnly, onJoined  , autoContinue = false }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [schedules, setSchedules] = useState([]);

  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const [st, list] = await Promise.allSettled([officialApi.status(setupId), officialApi.listJoinable(setupId)]);
    setStatus(st.status === "fulfilled" ? st.value : null);
    if (list.status === "fulfilled") setSchedules(list.value);
    else setError(errMsg(list.reason, "We couldn't load the official schedules. Please refresh and try again."));
    setLoading(false);
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  // GET /setup/:id/official returns officialStatus: none / available / joined / unavailable.
  // The older guesses stay as a fallback in case the API wrapper reshapes the response.
  const linked = Boolean(
    status &&
      (status.officialStatus === "joined" ||
        status.linked ||
        status.joined ||
        status.isLinked ||
        status.officialScheduleId ||
        status.scheduleId ||
        status.schedule)
  );

  // The preview may arrive as { preview: {...} } or as the preview itself
  const p = preview?.preview ?? preview;
  const dateChange = p?.dateChange ?? null;

  // The join result: { joined, schedule, setup: { startDate, endDate, ... }, summary }
  const joinedSetup = result?.setup;
  const joinedSummary = result?.summary;

  const choose = (s) => {
    setSelected(s);
    setGroups([]);
    setPreview(null);
    setConfirmed(false);
    setResult(null);
    setError("");
  };

  const toggleGroup = (key) => {
    // changing groups changes the outcome, so the preview and confirmation are reset
    setPreview(null);
    setConfirmed(false);
    setGroups((g) => (g.includes(key) ? g.filter((x) => x !== key) : [...g, key]));
  };

  const body = () => ({ scheduleId: idOf(selected), groups });

  const doPreview = async () => {
    setBusy("preview");
    setError("");
    setConfirmed(false);
    try {
      setPreview(await officialApi.previewJoin(setupId, body()));
    } catch (e) {
      setError(errMsg(e, "We couldn't load the preview. Please try again."));
    } finally {
      setBusy("");
    }
  };

  const doJoin = async () => {
    if (!preview || !confirmed) return;
    setBusy("join");
    setError("");
    try {
      const data = await officialApi.join(setupId, { ...body(), confirm: true });
      if (autoContinue && onJoined) {
        onJoined(data); 
        return;
      }
      setResult(data);
      setPreview(null);
      setConfirmed(false);
      await load();
      // onJoined is NOT called here: the student first sees what was merged, then presses Continue.
    } catch (e) {
      setError(errMsg(e, "We couldn't join this schedule. Please try again."));
    } finally {
      setBusy("");
    }
  };

  const doLeave = async () => {
    setBusy("leave");
    setError("");
    try {
      await officialApi.leave(setupId, {});
      setLeaveOpen(false);
      setSelected(null);
      setPreview(null);
      setConfirmed(false);
      setResult(null);
      await load();
    } catch (e) {
      setLeaveOpen(false);
      setError(errMsg(e, "We couldn't remove you from this schedule. Please try again."));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <PageSpinner />;

  const step = !selected ? 0 : !preview ? 1 : 2;
  const joinHint = !preview
    ? "Tap Preview first to see what will change."
    : !confirmed
      ? "Tick the box above to enable Join."
      : "";

  return (
    <div className="space-y-5">
      <Alert type="error">{error}</Alert>
      {readOnly && <Alert type="info">You are in view-only mode, so joining or leaving a schedule is turned off.</Alert>}

      {result && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div>
              <p className="text-[16px] font-semibold text-[#161827]">You have joined the official schedule</p>
              <p className="text-[13px] text-[#6A6F85]">These subjects and classes were added to your setup.</p>
            </div>
          </div>

          {joinedSetup?.startDate && joinedSetup?.endDate && (
            <div className="flex items-start gap-3 rounded-2xl bg-white/60 border border-white/80 p-4">
              <CalendarRange className="w-5 h-5 mt-0.5 text-indigo-600 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-[14px] font-semibold text-[#161827]">
                  {joinedSummary?.datesChanged ? "Semester dates updated" : "Semester dates"}
                </p>
                <p className="text-[13.5px] text-[#444A63] mt-0.5">{rangeText(joinedSetup.startDate, joinedSetup.endDate)}</p>
                {joinedSummary?.classesLeftOut > 0 && (
                  <p className="text-[12.5px] text-[#6A6F85] mt-1">
                    {joinedSummary.classesLeftOut} of your classes fall outside these dates and no longer count. Their marks are kept.
                  </p>
                )}
              </div>
            </div>
          )}

          <Warnings data={result} />
          <Summary data={result} />
          {onJoined && <Button onClick={() => onJoined(result)}>Continue</Button>}
        </Card>
      )}

      {linked && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <Link2 className="w-5 h-5" />
              </span>
              <div>
                <p className="text-[16px] font-semibold text-[#161827]">You are on an official schedule</p>
                <p className="text-[13px] text-[#6A6F85]">Changes made by your CR will appear in your setup automatically.</p>
              </div>
            </div>
            {!readOnly && (
              <Button variant="glass" size="sm" onClick={() => setLeaveOpen(true)}>
                <Unlink className="w-4 h-4" />
                Leave schedule
              </Button>
            )}
          </div>
          <Summary data={status} />
        </Card>
      )}

      {!linked && schedules.length === 0 && !error && (
        <EmptyState
          title="No official schedule available yet"
          text="Your class representative (CR) hasn't published a schedule for your college, branch and section. Until then, you can add your subjects and classes yourself."
        />
      )}

      {!linked && schedules.length > 0 && (
        <>
          <div className="space-y-3">
            <p className="text-[14px] text-[#6A6F85] max-w-2xl">
              Your CR has published a schedule for your class. Join it to get all your subjects and classes added at once, and your semester dates set to
              the official ones. Later updates from your CR sync into your setup automatically.
            </p>
            <StepIndicator current={step} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4" role="group" aria-label="Available schedules">
            {schedules.map((s) => {
              const on = idOf(s) === idOf(selected);
              const dates = rangeText(s.semesterStart, s.semesterEnd);
              return (
                <button
                  key={idOf(s)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(s)}
                  className={cx(
                    "text-left rounded-3xl p-5 border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                    on ? "bg-indigo-500/10 border-indigo-300 shadow-md" : "bg-white/55 border-white/80 hover:bg-white/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-semibold text-[#161827]">{titleOf(s)}</p>
                      {s.college && <p className="text-[13px] text-[#6A6F85] mt-0.5">{s.college}</p>}
                      <p className="flex items-center gap-1.5 text-[12.5px] text-[#6A6F85] mt-2">
                        <CalendarRange className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {dates ? `Semester ${dates}` : "No semester dates set. Yours stay as they are."}
                      </p>
                    </div>
                    {on && (
                      <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <Card className="p-6 space-y-5">
              {Array.isArray(selected.groups) && selected.groups.length > 0 && (
                <div>
                  <SectionLabel hint="Select every batch or group you belong to. You can skip this if none apply.">
                    Your lab batch / elective group
                  </SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {selected.groups.map((g, i) => (
                      <button
                        key={g.key || i}
                        type="button"
                        aria-pressed={groups.includes(g.key)}
                        onClick={() => toggleGroup(g.key)}
                        className={cx(
                          "h-9 px-4 rounded-full text-[13px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                          groups.includes(g.key)
                            ? "text-white bg-gradient-to-br from-[#5B52EE] to-[#2B8DE0] border-transparent"
                            : "bg-white/60 border-white/80 text-[#161827]/75 hover:bg-white/90"
                        )}
                      >
                        {g.label || g.key}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {preview && (
                <div className="space-y-3">
                  <SectionLabel hint="This is what joining will change in your setup.">Preview</SectionLabel>
                  <DatesPanel change={dateChange} schedule={p?.schedule ?? selected} />
                  <Warnings data={preview} />
                  <Summary data={preview} />
                </div>
              )}

              {preview && (
                <label className="flex items-start gap-3 rounded-2xl bg-amber-500/10 border border-amber-300/60 p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-[13.5px] text-[#161827]">
                    I understand that joining will cancel and lock the classes this schedule cancels, such as holidays, mass bunks and single-class cancellations
                    {dateChange ? ", and will change my semester dates to the official ones" : ""}.
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="glass" loading={busy === "preview"} onClick={doPreview} disabled={readOnly || busy === "join"}>
                  {preview ? "Refresh preview" : "Preview"}
                </Button>
                <Button loading={busy === "join"} onClick={doJoin} disabled={readOnly || !preview || !confirmed}>
                  Join this schedule
                </Button>
                {joinHint && <span className="text-[12.5px] text-[#6A6F85]">{joinHint}</span>}
              </div>
            </Card>
          )}
        </>
      )}

      <Modal open={leaveOpen} onClose={() => busy !== "leave" && setLeaveOpen(false)} title="Leave this schedule?">
        <div className="space-y-5">
          <p className="text-[14px] leading-relaxed text-[#444A63]">
            You will stop receiving updates from your CR. The subjects and classes already added to your setup will stay, and you can edit them yourself.
            Your semester dates stay as they are.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={busy === "leave"} onClick={doLeave}>
              Leave schedule
            </Button>
            <Button variant="glass" disabled={busy === "leave"} onClick={() => setLeaveOpen(false)}>
              Stay on schedule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OfficialJoin;