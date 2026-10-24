import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { officialSchedulesApi, errMsg } from "../../api/endpoints";
import { askNote, isWithdrawn } from "../../lib/prompt";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner } from "../../components/Ui";

const api = officialSchedulesApi.subjects;

// Works whether the backend returns `_id` or `id`
const idOf = (x) => x?._id || x?.id;

const SubjectsPanel = ({ scheduleId, readOnly, onChanged }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", code: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api.list(scheduleId));
    } catch (e) {
      setError(errMsg(e, "Could not load subjects"));
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    load();
  }, [load]);

  const open = (s) => {
    setEditing(s || "new");
    setForm({ name: s?.name || "", code: s?.code || "", note: "" });
    setFormError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const body = { name: form.name.trim(), code: form.code.trim() };
    if (form.note.trim()) body.note = form.note.trim();
    try {
      if (editing === "new") await api.create(scheduleId, body);
      else await api.update(scheduleId, idOf(editing), body);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the subject"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (s) => {
    const withdrawn = isWithdrawn(s);
    const note = askNote(withdrawn ? "Restore this subject. Note (optional)" : "Withdraw this subject from the schedule. Note (optional)");
    if (note === null) return;
    try {
      if (withdrawn) await api.restore(scheduleId, idOf(s), note);
      else await api.withdraw(scheduleId, idOf(s), note);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Could not update the subject"));
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] text-[#6A6F85]">{list.length} subject{list.length === 1 ? "" : "s"}</p>
        {!readOnly && <Button size="sm" onClick={() => open(null)}><Plus className="w-4 h-4" />Add subject</Button>}
      </div>

      <Alert type="error">{error}</Alert>

      {list.length === 0 ? (
        <EmptyState icon={BookOpen} title="No official subjects yet" text="Add the subjects for your section. Weekly classes are attached to them." action={!readOnly && <Button onClick={() => open(null)}><Plus className="w-4 h-4" />Add subject</Button>} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {list.map((s) => {
            const w = isWithdrawn(s);
            return (
              <Card key={idOf(s)} className={`p-5 flex items-center justify-between gap-3 ${w ? "opacity-60" : ""}`}>
                <div className="min-w-0">
                  <p className="text-[15.5px] font-semibold text-[#161827] truncate">{s.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {s.code && <Badge tone="brand">{s.code}</Badge>}
                    {w && <Badge tone="amber">Withdrawn</Badge>}
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex gap-0.5 shrink-0">
                    {!w && <button onClick={() => open(s)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>}
                    <button onClick={() => toggle(s)} aria-label={w ? "Restore" : "Withdraw"} title={w ? "Restore" : "Withdraw"} className={`w-9 h-9 rounded-full flex items-center justify-center ${w ? "text-[#161827]/70 hover:bg-white/80" : "text-rose-600 hover:bg-rose-50"}`}>
                      {w ? <RotateCcw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add official subject" : "Edit subject"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          <Field label="Subject name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Operating Systems" required />
          <Field label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS301" />
          <Field label="Note for the history (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Button type="submit" loading={saving}>{editing === "new" ? "Add subject" : "Save changes"}</Button>
        </form>
      </Modal>
    </div>
  );
};

export default SubjectsPanel;