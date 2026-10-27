import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Check, Link2, Unlink } from "lucide-react";
import { officialApi, errMsg } from "../api/endpoints";
import { Alert, Button, Card, EmptyState, Modal, PageSpinner, Summary, cx, Warnings } from "./Ui";

const idOf = (s) => s?._id || s?.id;
const titleOf = (s) =>
  [s.branch, s.section && `Section ${s.section}`, s.semesterLabel, s.academicYear].filter(Boolean).join(" - ") || "Official schedule";

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

// Join / leave a schedule published by your Class Representative (CR).
//   onJoined: called when the student presses "Continue" after seeing the join result
//
// Joining cancels and locks the classes the schedule cancels, so the server
// requires `confirm: true`. The student must preview the effect and tick the
// confirmation box before the Join button works.
const OfficialJoin = ({ setupId, readOnly, onJoined }) => {
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

  // The server reports officialStatus: none | available | joined | unavailable
  const linked = Boolean(
    status &&
      (status.officialStatus === "joined" ||
        status.officialStatus === "unavailable" ||
        status.linked ||
        status.joined ||
        status.isLinked ||
        status.officialScheduleId ||
        status.scheduleId ||
        status.schedule)
  );

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
      await officialApi.leave(setupId, { confirm: true });
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
          text="No published schedule matches this setup's academic year, semester, branch and section. Check those four values in the Settings tab (they must be exactly what your CR chose), or add your subjects and classes yourself until your CR publishes."
        />
      )}

      {!linked && schedules.length > 0 && (
        <>
          <div className="space-y-3">
            <p className="text-[14px] text-[#6A6F85] max-w-2xl">
              Your CR has published a schedule for your class. Join it to get all your subjects and classes added at once. Later updates from your CR sync into
              your setup automatically.
            </p>
            <StepIndicator current={step} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4" role="group" aria-label="Available schedules">
            {schedules.map((s) => {
              const on = idOf(s) === idOf(selected);
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
                    <div>
                      <p className="text-[15.5px] font-semibold text-[#161827]">{titleOf(s)}</p>
                      {s.college && <p className="text-[13px] text-[#6A6F85] mt-0.5">{s.college}</p>}
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
                <div>
                  <SectionLabel hint="This is what joining will add to your setup.">Preview</SectionLabel>
                  <Warnings data={preview} />
                  <div className="mt-2">
                    <Summary data={preview} />
                  </div>
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
                    I understand that joining will cancel and lock the classes this schedule cancels, such as holidays, mass bunks and single-class cancellations.
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