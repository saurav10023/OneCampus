import { useCallback, useEffect, useState } from "react";
import { History, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { officialSchedulesApi, errMsg } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, PageSpinner } from "../../components/Ui";
import { useNoteDialog } from "../../components/FormKit";

const api = officialSchedulesApi.actions;
const idOf = (x) => x?._id || x?.id; // works whether the backend returns `_id` or `id`

const when = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

const opTone = { undo: "amber", redo: "brand", revert: "red" };

// Every change to the schedule is logged here and can be undone or redone.
// Backend rules:
//  - Undo: only for an action that has not been undone and is not itself an undo.
//  - Redo: only for an action whose op is "undo" and that has not been redone.
//  - Revert: college admins only.
const HistoryPanel = ({ scheduleId, isAdmin, readOnly, version, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ask, noteDialog] = useNoteDialog();

  const load = useCallback(async () => {
    try {
      const rows = await api.list(scheduleId);
      setList([...rows].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)));
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load the history"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load, version]);

  const act = (fn, a, cfg) =>
    ask({
      ...cfg,
      message: `${cfg.message}${a.summary ? ` (“${a.summary}”)` : ""}`,
      run: async (note) => {
        await fn(scheduleId, idOf(a), note);
        await load();
        onChanged?.();
      },
    });

  if (loading) return <PageSpinner />;

  return (
    // @container: the row switches from stacked to side-by-side by the width of this panel
    <div className="@container space-y-3 sm:space-y-4 min-w-0">
      <Alert type="error">{error}</Alert>

      {list.length === 0 ? (
        <EmptyState icon={History} title="No changes yet" text="Every edit you make is recorded here so you can undo mistakes." />
      ) : (
        list.map((a) => {
          const aid = idOf(a);
          const canUndo = !a.undoneBy && a.op !== "undo";
          const canRedo = a.op === "undo" && !a.undoneBy;
          const reached = Number(a.affectedStudents);
          const hasActions = !readOnly && (canUndo || canRedo || isAdmin);
          return (
            <Card key={aid} className="p-3.5 min-[380px]:p-4 sm:p-5 flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-[14.5px] font-semibold text-[color:var(--ink)] break-words min-w-0">{a.summary || "Change"}</p>
                  {a.op && <Badge tone={opTone[a.op] || "neutral"}>{a.op}</Badge>}
                  {a.undoneBy && <Badge tone="amber">Undone</Badge>}
                  {a.actorRole && <Badge>{a.actorRole}</Badge>}
                </div>
                <p className="text-[12.5px] text-[color:var(--muted)] mt-1 break-words tabular-nums">
                  {[
                    when(a.createdAt),
                    Number.isFinite(reached) && a.affectedStudents != null && `reached ${reached} student${reached === 1 ? "" : "s"}`,
                    a.note && `“${a.note}”`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
              {hasActions && (
                <div className="flex flex-wrap gap-2 @xl:shrink-0">
                  {canUndo && (
                    <Button size="sm" variant="glass" onClick={() => act(api.undo, a, { title: "Undo change", message: "This change will be reversed for joined students.", confirmLabel: "Undo", tone: "primary" })}>
                      <Undo2 className="w-4 h-4" />Undo
                    </Button>
                  )}
                  {canRedo && (
                    <Button size="sm" variant="glass" onClick={() => act(api.redo, a, { title: "Redo change", message: "The undone change will be applied again.", confirmLabel: "Redo", tone: "primary" })}>
                      <Redo2 className="w-4 h-4" />Redo
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => act(api.revert, a, { title: "Revert change (admin)", message: "This forces the schedule back to how it was before this change.", confirmLabel: "Revert", tone: "danger" })}>
                      <RotateCcw className="w-4 h-4" />Revert
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })
      )}
      {noteDialog}
    </div>
  );
};

export default HistoryPanel;