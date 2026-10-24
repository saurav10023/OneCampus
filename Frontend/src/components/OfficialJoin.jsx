import { useCallback, useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { officialApi, errMsg } from "../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, PageSpinner, Summary, cx, Warnings } from "./Ui";

const idOf = (s) => s?._id || s?.id;
const titleOf = (s) =>
  [s.branch, s.section && `Section ${s.section}`, s.semesterLabel, s.academicYear].filter(Boolean).join(" · ") || "Official schedule";

// Join / leave a CR-published official schedule.
//   onJoined: called after a successful join (e.g. to continue onboarding)
const OfficialJoin = ({ setupId, readOnly, onJoined }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [schedules, setSchedules] = useState([]);

  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setError("");
    const [st, list] = await Promise.allSettled([officialApi.status(setupId), officialApi.listJoinable(setupId)]);
    setStatus(st.status === "fulfilled" ? st.value : null);
    if (list.status === "fulfilled") setSchedules(list.value);
    else setError(errMsg(list.reason, "Could not load official schedules"));
    setLoading(false);
  }, [setupId]);

  useEffect(() => {
    load();
  }, [load]);

  const linked = Boolean(
    status && (status.linked || status.joined || status.isLinked || status.officialScheduleId || status.scheduleId || status.schedule)
  );

  const choose = (s) => {
    setSelected(s);
    setGroups([]);
    setPreview(null);
    setResult(null);
    setError("");
  };

  const toggleGroup = (key) => {
    setPreview(null);
    setGroups((g) => (g.includes(key) ? g.filter((x) => x !== key) : [...g, key]));
  };

  const body = () => ({ scheduleId: idOf(selected), groups });

  const doPreview = async () => {
    setBusy("preview");
    setError("");
    try {
      setPreview(await officialApi.previewJoin(setupId, body()));
    } catch (e) {
      setError(errMsg(e, "Could not preview the join"));
    } finally {
      setBusy("");
    }
  };

  const doJoin = async () => {
    setBusy("join");
    setError("");
    try {
      const data = await officialApi.join(setupId, body());
      setResult(data);
      await load();
      onJoined?.(data);
    } catch (e) {
      setError(errMsg(e, "Could not join the schedule"));
    } finally {
      setBusy("");
    }
  };

  const doLeave = async () => {
    if (!window.confirm("Leave the official schedule? Your local copies of its subjects and classes are kept.")) return;
    setBusy("leave");
    setError("");
    try {
      await officialApi.leave(setupId, {});
      setSelected(null);
      setPreview(null);
      await load();
    } catch (e) {
      setError(errMsg(e, "Could not leave the schedule"));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <Alert type="error">{error}</Alert>
      <Warnings data={result} />

      {linked && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><Link2 className="w-5 h-5" /></span>
              <div>
                <p className="text-[16px] font-semibold text-[#161827]">Linked to an official schedule</p>
                <p className="text-[13px] text-[#6A6F85]">CR updates reach you automatically.</p>
              </div>
            </div>
            {!readOnly && (
              <Button variant="glass" size="sm" loading={busy === "leave"} onClick={doLeave}>
                <Unlink className="w-4 h-4" />Leave
              </Button>
            )}
          </div>
          <Summary data={status} />
        </Card>
      )}

      {!linked && schedules.length === 0 && !error && (
        <EmptyState
          title="No official schedule yet"
          text="Your class representative has not published one for your college, branch and section. You can add subjects and classes yourself."
        />
      )}

      {!linked && schedules.length > 0 && (
        <>
          <p className="text-[14px] text-[#6A6F85]">Pick your class schedule. Updates from your CR sync into your setup automatically.</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {schedules.map((s) => {
              const on = idOf(s) === idOf(selected);
              return (
                <button
                  key={idOf(s)}
                  type="button"
                  onClick={() => choose(s)}
                  className={cx(
                    "text-left rounded-3xl p-5 border transition",
                    on ? "bg-indigo-500/10 border-indigo-300 shadow-md" : "bg-white/55 border-white/80 hover:bg-white/80"
                  )}
                >
                  <p className="text-[15.5px] font-semibold text-[#161827]">{titleOf(s)}</p>
                  {s.college && <p className="text-[13px] text-[#6A6F85] mt-0.5">{s.college}</p>}
                </button>
              );
            })}
          </div>

          {selected && (
            <Card className="p-6 space-y-4">
              {Array.isArray(selected.groups) && selected.groups.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2">Your lab batch / elective group</p>
                  <div className="flex flex-wrap gap-2">
                    {selected.groups.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => toggleGroup(g.key)}
                        className={cx(
                          "h-9 px-4 rounded-full text-[13px] font-medium border transition",
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
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2">What will be added</p>
                  <Summary data={preview} />
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button variant="glass" loading={busy === "preview"} onClick={doPreview} disabled={readOnly}>Preview</Button>
                <Button loading={busy === "join"} onClick={doJoin} disabled={readOnly}>Join this schedule</Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default OfficialJoin;