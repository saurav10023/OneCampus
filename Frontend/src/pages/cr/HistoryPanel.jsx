import { useCallback, useEffect, useState } from "react";
import { History, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { officialSchedulesApi, errMsg } from "../../api/endpoints";
import { askNote } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, PageSpinner } from "../../components/Ui";

const api = officialSchedulesApi.actions;

// Works whether the backend returns `_id` or `id`
const idOf = (x) => x?._id || x?.id;

const when = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const titleOf = (a) => a.summary || a.description || a.title || [a.entityType || a.entity, a.type || a.action || a.kind].filter(Boolean).join(" · ") || "Change";

// Every change to the schedule is logged here and can be undone or redone.
const HistoryPanel = ({ scheduleId, isAdmin, readOnly, version, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setList(await api.list(scheduleId));
    } catch (e) {
      setError(errMsg(e, "Could not load the history"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (fn, a, ask) => {
    const note = askNote(ask);
    if (note === null) return;
    const aid = idOf(a);
    setBusyId(aid);
    setError("");
    try {
      await fn(scheduleId, aid, note);
      await load();
      onChanged?.();
    } catch (e) {
      setError(errMsg(e, "That did not work"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <Alert type="error">{error}</Alert>

      {list.length === 0 ? (
        <EmptyState icon={History} title="No changes yet" text="Every edit you make is recorded here so you can undo mistakes." />
      ) : (
        list.map((a) => {
          const aid = idOf(a);
          return (
            <Card key={aid} className="p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14.5px] font-semibold text-[#161827]">{titleOf(a)}</p>
                  {a.status && <Badge>{a.status}</Badge>}
                </div>
                <p className="text-[12.5px] text-[#6A6F85] mt-1">
                  {when(a.createdAt)}
                  {a.note && ` · "${a.note}"`}
                </p>
              </div>
              {!readOnly && (
                <div className="flex gap-2">
                  <Button size="sm" variant="glass" disabled={busyId === aid} onClick={() => run(api.undo, a, "Undo this change. Note (optional)")}><Undo2 className="w-4 h-4" />Undo</Button>
                  <Button size="sm" variant="ghost" disabled={busyId === aid} onClick={() => run(api.redo, a, "Redo this change. Note (optional)")}><Redo2 className="w-4 h-4" />Redo</Button>
                  {isAdmin && (
                    <Button size="sm" variant="ghost" disabled={busyId === aid} onClick={() => run(api.revert, a, "Revert this change as admin. Note (optional)")}><RotateCcw className="w-4 h-4" />Revert</Button>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
};

export default HistoryPanel;