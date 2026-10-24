import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { subjectsApi, errMsg } from "../../api/endpoints";
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageSpinner, Warnings } from "../../components/Ui";

const COLORS = ["#6366F1", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#14B8A6"];

const blank = { name: "", code: "", credits: "", targetPercentage: "", color: COLORS[0] };

const SubjectsTab = ({ setupId, readOnly }) => {
  const [subjects, setSubjects] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const [editing, setEditing] = useState(null); // null | "new" | subject
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [toDelete, setToDelete] = useState(null);
  const [impact, setImpact] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await subjectsApi.list(setupId, { limit: 100, sort: "name", isActive: !showArchived });
      setSubjects(data.subjects || []);
    } catch (e) {
      setError(errMsg(e, "Could not load subjects"));
    } finally {
      setLoading(false);
    }
  }, [setupId, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = (s) => {
    setEditing(s || "new");
    setForm(
      s
        ? { name: s.name || "", code: s.code || "", credits: s.credits ?? "", targetPercentage: s.targetPercentage ?? "", color: s.color || COLORS[0] }
        : blank
    );
    setFormError("");
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const body = { name: form.name.trim(), code: form.code.trim(), color: form.color };
    if (form.credits !== "") body.credits = Number(form.credits);
    if (form.targetPercentage !== "") body.targetPercentage = Number(form.targetPercentage);
    try {
      const data = editing === "new" ? await subjectsApi.create(setupId, body) : await subjectsApi.update(setupId, editing._id, body);
      setResult(data);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errMsg(err, "Could not save the subject"));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (s) => {
    try {
      if (s.isActive === false) await subjectsApi.restore(setupId, s._id);
      else await subjectsApi.archive(setupId, s._id);
      await load();
    } catch (err) {
      setError(errMsg(err, "Could not update the subject"));
    }
  };

  const askDelete = async (s) => {
    setToDelete(s);
    setConfirmName("");
    setDeleteError("");
    setImpact(null);
    try {
      setImpact(await subjectsApi.deleteImpact(setupId, s._id));
    } catch {
      /* preview is optional */
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await subjectsApi.remove(setupId, toDelete._id, confirmName);
      setToDelete(null);
      await load();
    } catch (err) {
      setDeleteError(errMsg(err, "Could not delete the subject"));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PageSpinner />;

  const impactRows = impact ? Object.entries(impact).filter(([, v]) => typeof v === "number") : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[13.5px] text-[#161827]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          Show archived
        </label>
        {!readOnly && !showArchived && (
          <Button size="sm" onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add subject</Button>
        )}
      </div>

      <Alert type="error">{error}</Alert>
      <Warnings data={result} />

      {subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={showArchived ? "No archived subjects" : "No subjects yet"}
          text={showArchived ? undefined : "Add the subjects you study this semester, then build your weekly classes on top."}
          action={!readOnly && !showArchived && <Button onClick={() => openForm(null)}><Plus className="w-4 h-4" />Add subject</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {subjects.map((s) => (
            <Card key={s._id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: s.color || "#6366F1" }} />
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-semibold text-[#161827] truncate">{s.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {s.code && <Badge tone="brand">{s.code}</Badge>}
                      {s.credits != null && <Badge>{s.credits} credits</Badge>}
                      {s.targetPercentage != null && <Badge>{s.targetPercentage}% target</Badge>}
                      {s.origin === "official" && <Badge tone="green">Official</Badge>}
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex gap-0.5 shrink-0">
                    {s.isActive !== false && (
                      <button onClick={() => openForm(s)} aria-label="Edit" className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80"><Pencil className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => toggleArchive(s)} aria-label={s.isActive === false ? "Restore" : "Archive"} title={s.isActive === false ? "Restore" : "Archive"} className="w-9 h-9 rounded-full flex items-center justify-center text-[#161827]/70 hover:bg-white/80">
                      {s.isActive === false ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                    <button onClick={() => askDelete(s)} aria-label="Delete" className="w-9 h-9 rounded-full flex items-center justify-center text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add subject" : "Edit subject"}>
        <form onSubmit={save} className="space-y-4">
          <Alert type="error">{formError}</Alert>
          <Field label="Subject name" value={form.name} onChange={set("name")} placeholder="Operating Systems" required />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Code" value={form.code} onChange={set("code")} placeholder="CS301" />
            <Field label="Credits" type="number" min="0" value={form.credits} onChange={set("credits")} />
            <Field label="Target %" type="number" min="0" max="100" value={form.targetPercentage} onChange={set("targetPercentage")} placeholder="Setup default" />
          </div>
          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6A6F85] mb-2 px-1">Colour</span>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  aria-label={c}
                  className={`w-8 h-8 rounded-full border-2 transition ${form.color === c ? "border-[#161827] scale-110" : "border-white"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Button type="submit" loading={saving}>{editing === "new" ? "Add subject" : "Save changes"}</Button>
        </form>
      </Modal>

      <Modal open={Boolean(toDelete)} onClose={() => !deleting && setToDelete(null)} title="Delete subject?">
        <div className="space-y-4">
          <p className="text-[14px] text-[#444A63]">
            This permanently removes <span className="font-semibold text-[#161827]">{toDelete?.name}</span> and its classes and attendance. Archiving keeps your history.
          </p>
          {impactRows.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {impactRows.map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-white/60 border border-white/80 px-3 py-2">
                  <p className="text-[17px] font-semibold text-[#161827] leading-none">{v}</p>
                  <p className="text-[11px] text-[#6A6F85] mt-1">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
                </div>
              ))}
            </div>
          )}
          <Alert type="error">{deleteError}</Alert>
          <Field label="Type the subject name to confirm" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={toDelete?.name} />
          <div className="flex gap-3">
            <Button variant="danger" loading={deleting} disabled={confirmName !== toDelete?.name} onClick={doDelete}>Delete subject</Button>
            <Button variant="glass" disabled={deleting} onClick={() => setToDelete(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SubjectsTab;